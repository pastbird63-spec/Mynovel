import os
from flask import Flask, redirect, url_for
from models import db
from routes.books import books_bp
from routes.characters import characters_bp
from routes.relationships import relationships_bp
from routes.plots import plots_bp
from routes.export import export_bp
from routes.import_ import import_bp
from routes.world import world_bp
from routes.chapters import chapters_bp
from routes.auth import auth_bp
from flask_wtf.csrf import CSRFProtect
from flask_login import LoginManager, current_user
from sqlalchemy import event
from sqlalchemy.engine import Engine

app = Flask(__name__)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, "novel.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24).hex())
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

csrf = CSRFProtect(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth.login'
login_manager.login_message = '请先登录'

from models import User
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

db.init_app(app)

# SQLite WAL mode + foreign key enforcement
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

app.register_blueprint(books_bp)
app.register_blueprint(characters_bp)
app.register_blueprint(relationships_bp)
app.register_blueprint(plots_bp)
app.register_blueprint(export_bp)
app.register_blueprint(import_bp)
app.register_blueprint(world_bp)
app.register_blueprint(chapters_bp)
app.register_blueprint(auth_bp)


@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('books.index'))
    return redirect(url_for('auth.login'))


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    from flask import send_from_directory, abort
    from flask_login import login_required as lr
    if not current_user.is_authenticated:
        return redirect(url_for('auth.login'))
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)
