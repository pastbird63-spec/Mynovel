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

if __name__ == '__main__':
    app.run(debug=True)
