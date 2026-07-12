from flask import Blueprint, render_template, request, redirect, url_for, flash
from models import db, Book, Character, WorldSetting

books_bp = Blueprint('books', __name__, url_prefix='/books')


@books_bp.route('/')
def index():
    books = Book.query.order_by(Book.created_at.desc()).all()
    unassigned_count = Character.query.filter_by(book_id=None).count()
    books_data = []
    for book in books:
        world_settings = WorldSetting.query.filter_by(book_id=book.id).order_by(WorldSetting.category, WorldSetting.created_at.desc()).all()
        books_data.append({'book': book, 'world_settings': world_settings})
    return render_template('books/index.html', books_data=books_data, unassigned_count=unassigned_count)


@books_bp.route('/create', methods=['GET', 'POST'])
def create():
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        if not title:
            flash('书名不能为空', 'danger')
            return redirect(url_for('books.create'))
        book = Book(
            title=title,
            genre=request.form.get('genre', ''),
            description=request.form.get('description', '')
        )
        db.session.add(book)
        db.session.commit()
        flash(f'「{book.title}」创建成功！', 'success')
        return redirect(url_for('books.index', book_id=book.id))
    return render_template('books/create.html')


@books_bp.route('/<int:id>')
def detail(id):
    book = Book.query.get_or_404(id)
    return render_template('books/detail.html', book=book)


@books_bp.route('/<int:id>/edit', methods=['GET', 'POST'])
def edit(id):
    book = Book.query.get_or_404(id)
    if request.method == 'POST':
        book.title = request.form.get('title', '').strip()
        book.genre = request.form.get('genre', '')
        book.description = request.form.get('description', '')
        db.session.commit()
        flash(f'「{book.title}」已更新', 'success')
        return redirect(url_for('books.index', book_id=book.id))
    return render_template('books/edit.html', book=book)


@books_bp.route('/<int:id>/delete', methods=['POST'])
def delete(id):
    book = Book.query.get_or_404(id)
    for character in book.characters:
        character.book_id = None
    db.session.delete(book)
    db.session.commit()
    flash(f'「{book.title}」已删除，旗下人物已移至未分类', 'warning')
    return redirect(url_for('books.index'))
