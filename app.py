import os
from flask import Flask, redirect, url_for
from models import db
from routes.books import books_bp
from routes.characters import characters_bp
from routes.relationships import relationships_bp
from routes.plots import plots_bp
from routes.export import export_bp
from routes.world import world_bp

app = Flask(__name__)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, "novel.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'novel-helper-secret-key-2024'
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

db.init_app(app)

app.register_blueprint(books_bp)
app.register_blueprint(characters_bp)
app.register_blueprint(relationships_bp)
app.register_blueprint(plots_bp)
app.register_blueprint(export_bp)
app.register_blueprint(world_bp)


@app.route('/')
def index():
    return redirect(url_for('books.index'))


with app.app_context():
    db.create_all()

    # 数据库迁移：安全地给旧表加新列
    from sqlalchemy import text, inspect
    inspector = inspect(db.engine)

    def add_column_if_missing(table, column, col_type):
        cols = [c['name'] for c in inspector.get_columns(table)]
        if column not in cols:
            with db.engine.connect() as conn:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
                conn.commit()

    add_column_if_missing('characters', 'book_id', 'INTEGER REFERENCES books(id)')
    if inspector.has_table('plot_nodes'):
        add_column_if_missing('plot_nodes', 'book_id', 'INTEGER REFERENCES books(id)')
        add_column_if_missing('plot_nodes', 'parent_id', 'INTEGER REFERENCES plot_nodes(id)')
    if inspector.has_table('relationships'):
        add_column_if_missing('relationships', 'book_id', 'INTEGER REFERENCES books(id)')
    # 修复旧记录的 book_id 兼容性
    with db.engine.connect() as conn:
        conn.execute(text("UPDATE characters SET book_id = NULL WHERE book_id = ''"))
        conn.commit()

if __name__ == '__main__':
    app.run(debug=True)
