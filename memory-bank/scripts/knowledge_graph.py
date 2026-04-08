#!/usr/bin/env python3
"""
knowledge_graph.py — Temporal Knowledge Graph для Memora
=========================================================

Локальный SQLite граф знаний с поддержкой временных окон.
Адаптировано из mempalace/knowledge_graph.py (mempalace v3.0.0, MIT License).

Отличия от оригинала:
  - Путь по умолчанию: memory-bank/.local/knowledge_graph.db (в проекте)
  - CLI интерфейс для всех операций
  - Предикаты ориентированы на multi-agent workflow
  - Убрано: seed_from_entity_facts (mempalace-специфично)
  - Добавлено: --project-root авто-определение, pretty-print вывод

Хранилище: SQLite (локально, без зависимостей, бесплатно)
Альтернатива Zep ($25/mo, Neo4j cloud) — тот же функционал локально.

Использование (Python API):
    from knowledge_graph import KnowledgeGraph

    kg = KnowledgeGraph()
    kg.add_triple("claude", "works_on", "auth-migration", valid_from="2026-04-08")
    kg.query_entity("claude")
    kg.invalidate("claude", "works_on", "auth-migration", ended="2026-04-09")
    kg.query_entity("claude", as_of="2026-04-08")

Использование (CLI):
    python3 memory-bank/scripts/knowledge_graph.py add claude works_on auth-migration
    python3 memory-bank/scripts/knowledge_graph.py query claude
    python3 memory-bank/scripts/knowledge_graph.py query claude --as-of 2026-04-08
    python3 memory-bank/scripts/knowledge_graph.py invalidate claude works_on auth-migration
    python3 memory-bank/scripts/knowledge_graph.py timeline
    python3 memory-bank/scripts/knowledge_graph.py timeline claude
    python3 memory-bank/scripts/knowledge_graph.py stats

Типичные предикаты для Memora:
    works_on       — агент работает над задачей/фичей
    completed      — агент завершил задачу
    decided        — агент/команда приняла решение
    uses           — проект/компонент использует технологию
    blocked_by     — задача заблокирована чем-то
    created        — агент создал файл/артефакт
    modified       — агент изменил файл
    depends_on     — компонент зависит от другого
    owns           — агент владеет/отвечает за компонент

Exit codes:
    0 — успех
    1 — ошибка аргументов или БД
"""

import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path

# ── Конфигурация ──────────────────────────────────────────────────────────────

def _default_db_path() -> str:
    """Найти путь к БД относительно корня проекта или текущей директории."""
    cwd = Path.cwd()
    # Ищем memory-bank/ вверх по дереву
    for parent in [cwd, *cwd.parents]:
        candidate = parent / "memory-bank" / ".local" / "knowledge_graph.db"
        if (parent / "memory-bank").is_dir():
            return str(candidate)
    # Fallback: текущая директория
    return str(cwd / "memory-bank" / ".local" / "knowledge_graph.db")


# ── KnowledgeGraph класс ──────────────────────────────────────────────────────

class KnowledgeGraph:
    """Temporal entity-relationship graph поверх SQLite."""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or _default_db_path()
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    # ── Инициализация БД ───────────────────────────────────────────────────

    def _init_db(self):
        conn = self._conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS entities (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                type        TEXT DEFAULT 'unknown',
                properties  TEXT DEFAULT '{}',
                created_at  TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS triples (
                id           TEXT PRIMARY KEY,
                subject      TEXT NOT NULL,
                predicate    TEXT NOT NULL,
                object       TEXT NOT NULL,
                valid_from   TEXT,
                valid_to     TEXT,
                confidence   REAL DEFAULT 1.0,
                source_file  TEXT,
                created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subject) REFERENCES entities(id),
                FOREIGN KEY (object)  REFERENCES entities(id)
            );

            CREATE INDEX IF NOT EXISTS idx_triples_subject   ON triples(subject);
            CREATE INDEX IF NOT EXISTS idx_triples_object    ON triples(object);
            CREATE INDEX IF NOT EXISTS idx_triples_predicate ON triples(predicate);
            CREATE INDEX IF NOT EXISTS idx_triples_valid     ON triples(valid_from, valid_to);
        """)
        conn.commit()
        conn.close()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _eid(self, name: str) -> str:
        """Нормализованный ID: lowercase, пробелы → подчёркивание."""
        return name.lower().replace(" ", "_").replace("'", "").replace("-", "_")

    # ── Write operations ───────────────────────────────────────────────────

    def add_entity(self, name: str, entity_type: str = "unknown", properties: dict = None) -> str:
        """Добавить или обновить узел-сущность."""
        eid = self._eid(name)
        props = json.dumps(properties or {})
        conn = self._conn()
        conn.execute(
            "INSERT OR REPLACE INTO entities (id, name, type, properties) VALUES (?, ?, ?, ?)",
            (eid, name, entity_type, props),
        )
        conn.commit()
        conn.close()
        return eid

    def add_triple(
        self,
        subject: str,
        predicate: str,
        obj: str,
        valid_from: str = None,
        valid_to: str = None,
        confidence: float = 1.0,
        source_file: str = None,
    ) -> str:
        """
        Добавить relationship triple: subject → predicate → object.

        Если идентичный активный triple уже существует — возвращает его ID без дубля.
        Автоматически создаёт entities если они не существуют.
        """
        sub_id = self._eid(subject)
        obj_id = self._eid(obj)
        pred = predicate.lower().replace(" ", "_").replace("-", "_")
        vf = valid_from or date.today().isoformat()

        conn = self._conn()

        # Авто-создание entities
        conn.execute("INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)", (sub_id, subject))
        conn.execute("INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)", (obj_id, obj))

        # Проверка дубля (тот же triple, ещё активен)
        existing = conn.execute(
            "SELECT id FROM triples WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL",
            (sub_id, pred, obj_id),
        ).fetchone()
        if existing:
            conn.close()
            return existing[0]

        tid = f"t_{sub_id}_{pred}_{obj_id}_{hashlib.md5(f'{vf}{datetime.now().isoformat()}'.encode()).hexdigest()[:8]}"
        conn.execute(
            """INSERT INTO triples
               (id, subject, predicate, object, valid_from, valid_to, confidence, source_file)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (tid, sub_id, pred, obj_id, vf, valid_to, confidence, source_file),
        )
        conn.commit()
        conn.close()
        return tid

    def invalidate(self, subject: str, predicate: str, obj: str, ended: str = None):
        """Пометить triple как недействительный (установить valid_to)."""
        sub_id = self._eid(subject)
        obj_id = self._eid(obj)
        pred = predicate.lower().replace(" ", "_").replace("-", "_")
        ended = ended or date.today().isoformat()

        conn = self._conn()
        conn.execute(
            "UPDATE triples SET valid_to=? WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL",
            (ended, sub_id, pred, obj_id),
        )
        conn.commit()
        conn.close()

    # ── Query operations ───────────────────────────────────────────────────

    def query_entity(self, name: str, as_of: str = None, direction: str = "outgoing") -> list[dict]:
        """
        Получить все relationships для сущности.

        direction: "outgoing" (entity → ?), "incoming" (? → entity), "both"
        as_of: дата ISO — вернуть только факты, действовавшие в этот момент
        """
        eid = self._eid(name)
        conn = self._conn()
        results = []

        def _time_filter(q, params):
            if as_of:
                q += " AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to > ?)"
                params.extend([as_of, as_of])
            return q, params

        if direction in ("outgoing", "both"):
            q = "SELECT t.*, e.name FROM triples t JOIN entities e ON t.object=e.id WHERE t.subject=?"
            q, p = _time_filter(q, [eid])
            for r in conn.execute(q, p).fetchall():
                results.append({
                    "direction": "→",
                    "subject": name,
                    "predicate": r[2],
                    "object": r[9],
                    "valid_from": r[4],
                    "valid_to": r[5],
                    "confidence": r[6],
                    "source_file": r[7],
                    "current": r[5] is None,
                })

        if direction in ("incoming", "both"):
            q = "SELECT t.*, e.name FROM triples t JOIN entities e ON t.subject=e.id WHERE t.object=?"
            q, p = _time_filter(q, [eid])
            for r in conn.execute(q, p).fetchall():
                results.append({
                    "direction": "←",
                    "subject": r[9],
                    "predicate": r[2],
                    "object": name,
                    "valid_from": r[4],
                    "valid_to": r[5],
                    "confidence": r[6],
                    "source_file": r[7],
                    "current": r[5] is None,
                })

        conn.close()
        return results

    def query_relationship(self, predicate: str, as_of: str = None) -> list[dict]:
        """Получить все triples с данным типом relationship."""
        pred = predicate.lower().replace(" ", "_").replace("-", "_")
        conn = self._conn()
        q = """
            SELECT t.*, s.name, o.name
            FROM triples t
            JOIN entities s ON t.subject=s.id
            JOIN entities o ON t.object=o.id
            WHERE t.predicate=?
        """
        params = [pred]
        if as_of:
            q += " AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to > ?)"
            params.extend([as_of, as_of])

        results = [
            {
                "subject": r[9],
                "predicate": pred,
                "object": r[10],
                "valid_from": r[4],
                "valid_to": r[5],
                "current": r[5] is None,
            }
            for r in conn.execute(q, params).fetchall()
        ]
        conn.close()
        return results

    def timeline(self, entity_name: str = None, limit: int = 50) -> list[dict]:
        """Хронологический список фактов, опционально отфильтрованный по сущности."""
        conn = self._conn()
        if entity_name:
            eid = self._eid(entity_name)
            rows = conn.execute("""
                SELECT t.*, s.name, o.name FROM triples t
                JOIN entities s ON t.subject=s.id
                JOIN entities o ON t.object=o.id
                WHERE t.subject=? OR t.object=?
                ORDER BY COALESCE(t.valid_from, t.created_at) ASC LIMIT ?
            """, (eid, eid, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT t.*, s.name, o.name FROM triples t
                JOIN entities s ON t.subject=s.id
                JOIN entities o ON t.object=o.id
                ORDER BY COALESCE(t.valid_from, t.created_at) ASC LIMIT ?
            """, (limit,)).fetchall()
        conn.close()
        return [
            {
                "subject": r[9],
                "predicate": r[2],
                "object": r[10],
                "valid_from": r[4],
                "valid_to": r[5],
                "current": r[5] is None,
            }
            for r in rows
        ]

    def stats(self) -> dict:
        """Статистика графа."""
        conn = self._conn()
        entities = conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
        triples   = conn.execute("SELECT COUNT(*) FROM triples").fetchone()[0]
        current   = conn.execute("SELECT COUNT(*) FROM triples WHERE valid_to IS NULL").fetchone()[0]
        predicates = [
            r[0] for r in conn.execute(
                "SELECT DISTINCT predicate FROM triples ORDER BY predicate"
            ).fetchall()
        ]
        conn.close()
        return {
            "entities": entities,
            "triples": triples,
            "current_facts": current,
            "expired_facts": triples - current,
            "relationship_types": predicates,
        }

    def delete_entity(self, name: str):
        """Удалить сущность и все связанные triples."""
        eid = self._eid(name)
        conn = self._conn()
        conn.execute("DELETE FROM triples WHERE subject=? OR object=?", (eid, eid))
        conn.execute("DELETE FROM entities WHERE id=?", (eid,))
        conn.commit()
        conn.close()


# ── Pretty print helpers ──────────────────────────────────────────────────────

def _fmt_triple(t: dict) -> str:
    status = "✓" if t["current"] else "✗"
    vf = t.get("valid_from") or "?"
    vt = t.get("valid_to") or "now"
    src = f" [{t['source_file']}]" if t.get("source_file") else ""
    return f"  {status} {t['subject']} --{t['predicate']}--> {t['object']}  ({vf}…{vt}){src}"


def _print_triples(triples: list[dict], title: str = ""):
    if title:
        print(f"\n{title}")
    if not triples:
        print("  (нет записей)")
        return
    current = [t for t in triples if t["current"]]
    expired = [t for t in triples if not t["current"]]
    if current:
        print("  Активные:")
        for t in current:
            print(_fmt_triple(t))
    if expired:
        print("  История:")
        for t in expired:
            print(_fmt_triple(t))


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Temporal Knowledge Graph для Memora",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примеры:
  python3 knowledge_graph.py add claude works_on auth-migration
  python3 knowledge_graph.py add claude works_on auth-migration --from 2026-04-08
  python3 knowledge_graph.py query claude
  python3 knowledge_graph.py query claude --as-of 2026-04-01
  python3 knowledge_graph.py query claude --direction both
  python3 knowledge_graph.py invalidate claude works_on auth-migration
  python3 knowledge_graph.py rel works_on
  python3 knowledge_graph.py timeline
  python3 knowledge_graph.py timeline claude
  python3 knowledge_graph.py stats
  python3 knowledge_graph.py delete claude
        """
    )
    parser.add_argument("--db", help="Путь к SQLite файлу (default: auto)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # add
    p_add = sub.add_parser("add", help="Добавить triple")
    p_add.add_argument("subject")
    p_add.add_argument("predicate")
    p_add.add_argument("object")
    p_add.add_argument("--from", dest="valid_from", help="Дата начала (ISO)")
    p_add.add_argument("--to", dest="valid_to", help="Дата конца (ISO)")
    p_add.add_argument("--conf", type=float, default=1.0, help="Уверенность 0.0-1.0")
    p_add.add_argument("--src", dest="source_file", help="Исходный файл/сессия")

    # invalidate
    p_inv = sub.add_parser("invalidate", help="Завершить triple (valid_to = сегодня)")
    p_inv.add_argument("subject")
    p_inv.add_argument("predicate")
    p_inv.add_argument("object")
    p_inv.add_argument("--ended", help="Дата окончания (default: сегодня)")

    # query
    p_q = sub.add_parser("query", help="Запросить связи сущности")
    p_q.add_argument("entity")
    p_q.add_argument("--as-of", dest="as_of", help="Историческая дата (ISO)")
    p_q.add_argument("--direction", choices=["outgoing", "incoming", "both"], default="outgoing")

    # rel (query by relationship type)
    p_rel = sub.add_parser("rel", help="Запросить по типу связи")
    p_rel.add_argument("predicate")
    p_rel.add_argument("--as-of", dest="as_of", help="Историческая дата (ISO)")

    # timeline
    p_tl = sub.add_parser("timeline", help="Хронологический список фактов")
    p_tl.add_argument("entity", nargs="?", help="Фильтр по сущности (опционально)")
    p_tl.add_argument("--limit", type=int, default=50)

    # stats
    sub.add_parser("stats", help="Статистика графа")

    # delete
    p_del = sub.add_parser("delete", help="Удалить сущность и все её triples")
    p_del.add_argument("entity")

    args = parser.parse_args()
    kg = KnowledgeGraph(db_path=args.db)

    if args.cmd == "add":
        tid = kg.add_triple(
            args.subject, args.predicate, args.object,
            valid_from=args.valid_from,
            valid_to=args.valid_to,
            confidence=args.conf,
            source_file=args.source_file,
        )
        print(f"✓ Добавлено: {args.subject} --{args.predicate}--> {args.object}  (id: {tid})")

    elif args.cmd == "invalidate":
        kg.invalidate(args.subject, args.predicate, args.object, ended=args.ended)
        ended = args.ended or date.today().isoformat()
        print(f"✓ Завершено: {args.subject} --{args.predicate}--> {args.object}  (valid_to: {ended})")

    elif args.cmd == "query":
        results = kg.query_entity(args.entity, as_of=args.as_of, direction=args.direction)
        label = f"Запрос: {args.entity}"
        if args.as_of:
            label += f" (as_of: {args.as_of})"
        _print_triples(results, label)

    elif args.cmd == "rel":
        results = kg.query_relationship(args.predicate, as_of=args.as_of)
        label = f"Связь: {args.predicate}"
        if args.as_of:
            label += f" (as_of: {args.as_of})"
        _print_triples(results, label)

    elif args.cmd == "timeline":
        results = kg.timeline(entity_name=args.entity, limit=args.limit)
        label = f"Timeline{': ' + args.entity if args.entity else ' (все)'}"
        _print_triples(results, label)

    elif args.cmd == "stats":
        s = kg.stats()
        print(f"\nKnowledge Graph статистика ({kg.db_path})")
        print(f"  Сущности:       {s['entities']}")
        print(f"  Всего фактов:   {s['triples']}")
        print(f"  Активных:       {s['current_facts']}")
        print(f"  Истёкших:       {s['expired_facts']}")
        if s["relationship_types"]:
            print(f"  Типы связей:    {', '.join(s['relationship_types'])}")

    elif args.cmd == "delete":
        kg.delete_entity(args.entity)
        print(f"✓ Удалено: {args.entity} и все связанные triples")


if __name__ == "__main__":
    main()
