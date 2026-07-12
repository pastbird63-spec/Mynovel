import os
import uuid
from flask import Blueprint, render_template, request, redirect, url_for, flash, current_app
from models import db, Character, CharacterField, CharacterImage, Book
from PIL import Image

characters_bp = Blueprint('characters', __name__, url_prefix='/characters')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def allowed_file(filename):
    if not filename or '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def save_image(file, character_id):
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"char_{character_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    with Image.open(filepath) as img:
        img.thumbnail((800, 800))
        img.save(filepath)
    return filename


def get_book_id():
    """安全地从表单取 book_id，空字符串或非数字返回 None"""
    val = request.form.get('book_id', '').strip()
    try:
        return int(val) if val else None
    except (ValueError, TypeError):
        return None


@characters_bp.route('/')
def index():
    book_id = request.args.get('book_id', type=int)
    books = Book.query.order_by(Book.title).all()
    if book_id:
        characters = Character.query.filter_by(book_id=book_id).order_by(Character.created_at.desc()).all()
        current_book = Book.query.get(book_id)
    else:
        characters = Character.query.order_by(Character.created_at.desc()).all()
        current_book = None
    return render_template('characters/index.html',
                           characters=characters, books=books, current_book=current_book)


@characters_bp.route('/create', methods=['GET', 'POST'])
def create():
    books = Book.query.all()
    preselected_book_id = request.args.get('book_id', type=int)
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        if not name:
            flash('姓名不能为空', 'danger')
            return redirect(url_for('characters.create'))
        character = Character(
            name=name,
            alias=request.form.get('alias', ''),
            age=request.form.get('age', ''),
            gender=request.form.get('gender', ''),
            description=request.form.get('description', ''),
            book_id=get_book_id()
        )
        db.session.add(character)
        db.session.flush()
        for fname, fvalue in zip(request.form.getlist('field_name'),
                                  request.form.getlist('field_value')):
            if fname.strip():
                db.session.add(CharacterField(
                    character_id=character.id,
                    field_name=fname.strip(),
                    field_value=fvalue.strip()
                ))
        for file in request.files.getlist('images'):
            if file and file.filename and allowed_file(file.filename):
                fn = save_image(file, character.id)
                db.session.add(CharacterImage(character_id=character.id, filename=fn))
        db.session.commit()
        flash(f'人物「{character.name}」创建成功！', 'success')
        return redirect(url_for('books.index', book_id=character.book_id, tab='char', highlight=character.id))
    return render_template('characters/create.html', books=books,
                           preselected_book_id=preselected_book_id)


@characters_bp.route('/<int:id>')
def detail(id):
    character = Character.query.get_or_404(id)
    return render_template('characters/detail.html', character=character)


@characters_bp.route('/<int:id>/edit', methods=['GET', 'POST'])
def edit(id):
    character = Character.query.get_or_404(id)
    books = Book.query.all()
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        if not name:
            flash('姓名不能为空', 'danger')
            return redirect(url_for('characters.edit', id=id))
        character.name = name
        character.alias = request.form.get('alias', '')
        character.age = request.form.get('age', '')
        character.gender = request.form.get('gender', '')
        character.description = request.form.get('description', '')
        character.book_id = get_book_id()
        CharacterField.query.filter_by(character_id=character.id).delete()
        for fname, fvalue in zip(request.form.getlist('field_name'),
                                  request.form.getlist('field_value')):
            if fname.strip():
                db.session.add(CharacterField(
                    character_id=character.id,
                    field_name=fname.strip(),
                    field_value=fvalue.strip()
                ))
        for file in request.files.getlist('images'):
            if file and file.filename and allowed_file(file.filename):
                fn = save_image(file, character.id)
                db.session.add(CharacterImage(character_id=character.id, filename=fn))
        db.session.commit()
        flash(f'人物「{character.name}」已更新', 'success')
        return redirect(url_for('books.index', book_id=character.book_id, tab='char', highlight=character.id))
    return render_template('characters/edit.html', character=character, books=books)


@characters_bp.route('/<int:id>/delete', methods=['POST'])
def delete(id):
    character = Character.query.get_or_404(id)
    for image in character.images:
        fp = os.path.join(current_app.config['UPLOAD_FOLDER'], image.filename)
        if os.path.exists(fp):
            os.remove(fp)
    db.session.delete(character)
    db.session.commit()
    book_id = character.book_id
    flash(f'人物「{character.name}」已删除', 'warning')
    return redirect(url_for('books.index', book_id=book_id, tab='char'))


@characters_bp.route('/image/<int:image_id>/delete', methods=['POST'])
def delete_image(image_id):
    image = CharacterImage.query.get_or_404(image_id)
    character_id = image.character_id
    fp = os.path.join(current_app.config['UPLOAD_FOLDER'], image.filename)
    try:
        if os.path.exists(fp):
            os.remove(fp)
    except Exception as e:
        current_app.logger.error(f'图片文件删除失败: {e}')
        flash('图片文件清理异常，记录已删除', 'warning')
    db.session.delete(image)
    db.session.commit()
    
    flash('图片已删除', 'success')
    return redirect(url_for('characters.edit', id=character_id))
