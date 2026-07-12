"""数据库迁移脚本 — 安全地给旧表加新列，幂等运行"""
import os
from app import app
from models import db
from sqlalchemy import text, inspect

with app.app_context():
    db.create_all()

    inspector = inspect(db.engine)

    def add_column_if_missing(table, column, col_type):
        cols = [c['name'] for c in inspector.get_columns(table)]
        if column not in cols:
            with db.engine.connect() as conn:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
                conn.commit()
            print(f'  ✓ {table}.{column} 已添加')
        else:
            print(f'  - {table}.{column} 已存在，跳过')

    print('正在运行数据库迁移...')

    add_column_if_missing('characters', 'book_id', 'INTEGER REFERENCES books(id)')

    if inspector.has_table('plot_nodes'):
        add_column_if_missing('plot_nodes', 'book_id', 'INTEGER REFERENCES books(id)')
        add_column_if_missing('plot_nodes', 'parent_id', 'INTEGER REFERENCES plot_nodes(id)')

    if inspector.has_table('relationships'):
        add_column_if_missing('relationships', 'book_id', 'INTEGER REFERENCES books(id)')

    # 修复旧记录的 book_id 兼容性
    with db.engine.connect() as conn:
        result = conn.execute(text("UPDATE characters SET book_id = NULL WHERE book_id = ''"))
        conn.commit()
        if result.rowcount > 0:
            print(f'  ✓ 修复了 {result.rowcount} 条 characters 记录的空白 book_id')

    print('迁移完成。')
