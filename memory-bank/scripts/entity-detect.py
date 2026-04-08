#!/usr/bin/env python3
"""
entity-detect.py — двухпроходное обнаружение сущностей в markdown-файлах

Адаптировано из паттерна mempalace/entity_detector.py (mempalace v3.0.0, MIT License)
Упрощено для markdown-first системы Memora.

Назначение:
  Сканирует *.md файлы в указанной директории, обнаруживает кандидатов на
  роль Persons (люди) и Projects (проекты/системы), выводит JSON-список
  кандидатов для интерактивного подтверждения агентом.

Использование:
  python3 memory-bank/scripts/entity-detect.py [--dir PATH] [--output PATH] [--quiet]

  --dir PATH      Директория для сканирования (default: .)
  --output PATH   Путь для сохранения entities.json
                  (default: memory-bank/.local/entities.json)
  --quiet         Вывод только JSON, без статистики

Exit codes:
  0  — успех
  1  — директория не найдена
"""

import re
import json
import sys
import argparse
from pathlib import Path
from collections import defaultdict

# ── Сигнальные паттерны ────────────────────────────────────────────────────────

# Паттерны для обнаружения ПЕРСОН
PERSON_PATTERNS = [
    # "Alice said", "Bob asked", "Carol mentioned"
    r'\b([A-Z][a-z]{1,20})\s+(?:said|asked|mentioned|replied|noted|confirmed|decided|suggested|wrote|told)\b',
    # "asked Alice", "told Bob", "assigned to Carol"
    r'\b(?:asked|told|assigned\s+to|worked\s+with|reviewed\s+by|approved\s+by)\s+([A-Z][a-z]{1,20})\b',
    # "> Alice:" или "**Alice**:" (dialogue markers)
    r'^>\s*([A-Z][a-z]{1,20})\s*:',
    r'^\*\*([A-Z][a-z]{1,20})\*\*\s*:',
    # "@alice" GitHub-style mentions
    r'@([a-z][a-z0-9_-]{1,20})\b',
]

# Паттерны для обнаружения ПРОЕКТОВ/СИСТЕМ
PROJECT_PATTERNS = [
    # "building X", "shipped X", "launched X", "deployed X"
    r'\b(?:building|shipped|launched|deployed|migrating|refactoring|integrating)\s+([A-Za-z][A-Za-z0-9_-]{2,30})\b',
    # kebab-case и snake_case идентификаторы (встречаются 2+ раза)
    r'\b([a-z][a-z0-9]{1,15}-[a-z][a-z0-9-]{1,20})\b',  # kebab: auth-service
    r'\b([a-z][a-z0-9]{1,15}_[a-z][a-z0-9_]{1,20})\b',  # snake: auth_service
    # "X v1.2", "X version"
    r'\b([A-Za-z][A-Za-z0-9_-]{2,25})\s+v\d+\.\d+\b',
    # import/require (code references)
    r'(?:import|from|require)\s+[\'"]([a-z][a-z0-9_-]{2,30})[\'"]',
]

# Стоп-слова — никогда не считаются сущностями
STOPWORDS_PERSON = {
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'shall', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
    'he', 'she', 'they', 'we', 'you', 'i', 'me', 'him', 'her', 'them', 'us',
    'my', 'his', 'our', 'your', 'their', 'true', 'false', 'none', 'null',
    # Технические термины, похожие на имена
    'Get', 'Set', 'Run', 'Add', 'Edit', 'Read', 'Write', 'Find', 'Load',
    'Save', 'Send', 'Call', 'Stop', 'Start', 'Update', 'Delete', 'Create',
    'Note', 'Todo', 'Fix', 'Bug', 'Test', 'New', 'Old', 'All', 'Any',
    'Log', 'Error', 'Type', 'List', 'Map', 'Key', 'Value', 'Data',
}

STOPWORDS_PROJECT = {
    'the', 'and', 'or', 'for', 'with', 'from', 'into', 'over', 'under',
    # Общие технические термины
    'git', 'npm', 'pip', 'brew', 'curl', 'bash', 'sh', 'zsh',
    'http', 'https', 'json', 'yaml', 'toml', 'html', 'css', 'sql',
    'api', 'cli', 'sdk', 'lib', 'pkg', 'src', 'bin', 'tmp', 'env',
    'dev', 'prod', 'test', 'docs', 'log', 'logs', 'config', 'dist',
    'main', 'index', 'utils', 'types', 'models', 'views', 'routes',
    # Memory bank внутренние термины
    'memory-bank', 'memory-restore', 'memory-bootstrap', 'memory-gc',
    'memory-reflect', 'memory-consolidate', 'memory-audit', 'memory-clarify',
    'open-questions', 'open_questions', 'on_fail', 'on-fail',
    'constitution_conflict', 'fact_conflict', 'pii_risk',
    'memory_model', 'memory-model', 'getting_started',
    'pre-commit', 'pre_commit',
    # Английские конструкции, встречающиеся как kebab
    'in-progress', 'up-to-date', 'out-of-date', 'step-by-step',
    'well-known', 'long-term', 'short-term', 'end-to-end', 'long-lived',
    'high-level', 'low-level', 'built-in', 'run-time', 'compile-time',
}

# Паттерны, которые однозначно НЕ являются проектами
PROJECT_EXCLUDE_PATTERNS = [
    r'^on_',      # on_fail, on_error
    r'_trigger$', # gc_trigger, reflect_trigger
    r'_type$',    # observation_type
    r'_model$',   # memory_model
    r'_bank$',    # memory_bank
    r'^getting_', # getting_started
    r'_conflict$',
    r'_risk$',
    r'_path$',
    r'_dir$',
    r'_file$',
]

# ── Сканирование файлов ────────────────────────────────────────────────────────

def scan_files(directory: Path, extra_exclude: set = None) -> list[Path]:
    """Найти все *.md файлы, исключая шаблоны и системные."""
    md_files = []
    exclude_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv',
                    'ARCHIVE', 'ADR'}
    if extra_exclude:
        exclude_dirs |= extra_exclude
    exclude_names = {'_template.md', 'CHANGELOG.md', 'LICENSE.md'}

    for f in directory.rglob('*.md'):
        if any(part in exclude_dirs for part in f.parts):
            continue
        if f.name in exclude_names:
            continue
        md_files.append(f)

    return sorted(md_files)


def extract_text(file_path: Path) -> str:
    """Читает файл, убирает YAML front matter и code blocks."""
    try:
        text = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return ''

    # Убрать YAML front matter
    if text.startswith('---'):
        end = text.find('\n---\n', 3)
        if end != -1:
            text = text[end + 4:]

    # Убрать code blocks (снижаем ложные срабатывания от import-строк)
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`[^`]+`', '', text)

    return text

# ── Двухпроходное обнаружение ────────────────────────────────────────────────

def detect_persons(files: list[Path]) -> dict[str, dict]:
    """Pass 1: обнаружение кандидатов-персон."""
    candidates = defaultdict(lambda: {'count': 0, 'sources': []})

    for f in files:
        text = extract_text(f)
        if not text:
            continue

        for pattern in PERSON_PATTERNS:
            for match in re.finditer(pattern, text, re.MULTILINE | re.IGNORECASE):
                name = match.group(1).strip()
                # Нормализуем: первая буква заглавная
                name_norm = name.capitalize() if not name.startswith('@') else name.lower()

                if name_norm.lower() in STOPWORDS_PERSON:
                    continue
                if len(name_norm) < 2 or len(name_norm) > 25:
                    continue
                # Исключаем чисто технические имена (все заглавные — акроним)
                if name_norm.isupper():
                    continue

                candidates[name_norm]['count'] += 1
                src = str(f)
                if src not in candidates[name_norm]['sources']:
                    candidates[name_norm]['sources'].append(src)

    # Фильтр: минимум 2 упоминания или в 2+ файлах
    return {
        name: data for name, data in candidates.items()
        if data['count'] >= 2 or len(data['sources']) >= 2
    }


def detect_projects(files: list[Path]) -> dict[str, dict]:
    """Pass 2: обнаружение кандидатов-проектов."""
    candidates = defaultdict(lambda: {'count': 0, 'sources': []})

    for f in files:
        text = extract_text(f)
        if not text:
            continue

        for pattern in PROJECT_PATTERNS:
            for match in re.finditer(pattern, text, re.MULTILINE | re.IGNORECASE):
                name = match.group(1).strip().lower()

                if name in STOPWORDS_PROJECT:
                    continue
                if len(name) < 3 or len(name) > 40:
                    continue
                # Исключаем пути файловой системы
                if '/' in name or '\\' in name:
                    continue
                # Исключаем внутренние snake_case паттерны memory bank
                if any(re.search(pat, name) for pat in PROJECT_EXCLUDE_PATTERNS):
                    continue
                # Исключаем строки с 3+ подчёркиваниями (likely internal refs)
                if name.count('_') >= 3:
                    continue

                candidates[name]['count'] += 1
                src = str(f)
                if src not in candidates[name]['sources']:
                    candidates[name]['sources'].append(src)

    # Фильтр: минимум 3 упоминания или в 2+ файлах
    return {
        name: data for name, data in candidates.items()
        if data['count'] >= 3 or len(data['sources']) >= 2
    }

# ── Форматирование вывода ────────────────────────────────────────────────────

def build_output(persons: dict, projects: dict, scanned: int) -> dict:
    """Формирует итоговую структуру для entities.json."""
    return {
        "_meta": {
            "generated_by": "entity-detect.py",
            "files_scanned": scanned,
            "status": "candidates",
            "note": "Требует ревью агентом. Подтверждённые сущности перенеси в confirmed: true."
        },
        "persons": [
            {
                "name": name,
                "type": "person",
                "confirmed": False,
                "wing": f"",
                "mentions": data['count'],
                "sources": data['sources'][:3],  # Максимум 3 источника
            }
            for name, data in sorted(persons.items(), key=lambda x: -x[1]['count'])
        ],
        "projects": [
            {
                "name": name,
                "type": "project",
                "confirmed": False,
                "wing": f"feature-{name}",
                "mentions": data['count'],
                "sources": data['sources'][:3],
            }
            for name, data in sorted(projects.items(), key=lambda x: -x[1]['count'])
        ]
    }

# ── Точка входа ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Обнаружение сущностей в markdown-файлах для Memora memory bank'
    )
    parser.add_argument('--dir', default='.', help='Директория для сканирования')
    parser.add_argument(
        '--output',
        default='memory-bank/.local/entities.json',
        help='Путь для сохранения JSON-результата'
    )
    parser.add_argument('--quiet', action='store_true', help='Только JSON-вывод')
    parser.add_argument(
        '--exclude', nargs='*', default=[],
        help='Дополнительные директории для исключения (например: --exclude vendor third-party)'
    )
    args = parser.parse_args()

    scan_dir = Path(args.dir).expanduser().resolve()
    if not scan_dir.is_dir():
        print(f'❌ Директория не найдена: {scan_dir}', file=sys.stderr)
        sys.exit(1)

    if not args.quiet:
        print(f'🔍 Сканирование: {scan_dir}')

    files = scan_files(scan_dir, extra_exclude=set(args.exclude))

    if not args.quiet:
        print(f'   Найдено файлов: {len(files)}')

    persons = detect_persons(files)
    projects = detect_projects(files)

    output = build_output(persons, projects, len(files))

    # Сохранить результат
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))

    if not args.quiet:
        print(f'\n📊 Результат:')
        print(f'   Персоны-кандидаты:  {len(persons)}')
        print(f'   Проекты-кандидаты:  {len(projects)}')
        print(f'   Сохранено в:        {output_path}')
        print()
        print('👉 Следующий шаг: агент проверяет кандидатов и устанавливает confirmed: true')
        print('   для подтверждённых сущностей в entities.json')

    # Вывод краткого списка в stdout для агента
    if persons or projects:
        print('\n--- КАНДИДАТЫ ---')
        if persons:
            print('Персоны:', ', '.join(
                f'{n} ({d["count"]}x)' for n, d in
                sorted(persons.items(), key=lambda x: -x[1]['count'])[:10]
            ))
        if projects:
            print('Проекты:', ', '.join(
                f'{n} ({d["count"]}x)' for n, d in
                sorted(projects.items(), key=lambda x: -x[1]['count'])[:10]
            ))
    else:
        print('Кандидаты не обнаружены — файлов слишком мало или паттерны не совпали.')


if __name__ == '__main__':
    main()
