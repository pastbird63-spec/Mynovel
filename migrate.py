"""数据库迁移脚本 — 安全地给旧表加新列，幂等运行"""
import os
from app import app
from models import db, User
from sqlalchemy import text, inspect
from werkzeug.security import generate_password_hash

with app.app_context():
    db.create_all()

    inspector = inspect(db.engine)

    def add_column_if_missing(table, column, col_type):
        cols = [c['name'] for c in inspector.get_columns(table)]
        if column not in cols:
            with db.engine.connect() as conn:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
                conn.commit()
            print(f'  [OK] {table}.{column} added')
        else:
            print(f'  [SKIP] {table}.{column} already exists')

    print('Running database migration...')

    # ── 旧迁移（兼容老库） ──
    add_column_if_missing('books', 'type', "VARCHAR(10) DEFAULT 'writing'")
    add_column_if_missing('chapters', 'paper_size', "VARCHAR(10) DEFAULT 'a5'")
    add_column_if_missing('characters', 'book_id', 'INTEGER REFERENCES books(id)')

    if inspector.has_table('plot_nodes'):
        add_column_if_missing('plot_nodes', 'book_id', 'INTEGER REFERENCES books(id)')
        add_column_if_missing('plot_nodes', 'parent_id', 'INTEGER REFERENCES plot_nodes(id)')

    if inspector.has_table('relationships'):
        add_column_if_missing('relationships', 'book_id', 'INTEGER REFERENCES books(id)')

    # ── 用户系统迁移 ──
    add_column_if_missing('books', 'user_id', 'INTEGER REFERENCES users(id)')
    add_column_if_missing('characters', 'user_id', 'INTEGER REFERENCES users(id)')
    add_column_if_missing('world_settings', 'user_id', 'INTEGER REFERENCES users(id)')

    # 创建默认用户（如不存在）并把现有数据归到该用户
    with db.engine.connect() as conn:
        admin = conn.execute(
            text("SELECT id FROM users WHERE username = 'admin'")
        ).fetchone()
        if not admin:
            conn.execute(
                text("INSERT INTO users (username, password_hash) VALUES ('admin', :pw)"),
                {'pw': generate_password_hash('admin123')}
            )
            conn.commit()
            admin = conn.execute(
                text("SELECT id FROM users WHERE username = 'admin'")
            ).fetchone()
            print(f'  [OK] Default admin user created (id={admin[0]})')
        admin_id = admin[0]

        # 把无主数据归属给 admin
        for tbl in ['books', 'characters', 'world_settings']:
            result = conn.execute(
                text(f"UPDATE {tbl} SET user_id = :uid WHERE user_id IS NULL"),
                {'uid': admin_id}
            )
            conn.commit()
            if result.rowcount > 0:
                print(f'  [OK] Assigned {result.rowcount} orphan {tbl} to admin (id={admin_id})')

    # 修复旧记录的 book_id 兼容性
    with db.engine.connect() as conn:
        result = conn.execute(text("UPDATE characters SET book_id = NULL WHERE book_id = ''"))
        conn.commit()
        if result.rowcount > 0:
            print(f'  [OK] Fixed {result.rowcount} characters records with blank book_id')

    print('Migration done.')
