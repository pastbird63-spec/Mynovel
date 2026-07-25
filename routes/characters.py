import os
import uuid
from io import BytesIO
from flask import Blueprint, render_template, request, redirect, url_for, flash, current_app, abort
from flask_login import login_required, current_user
from models import db, Character, CharacterField, CharacterImage, Book, Relationship, PlotCharacter
from PIL import Image
from sqlalchemy import or_

characters_bp = Blueprint('characters', __name__, url_prefix='/characters')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def allowed_file(filename):
    if not filename or '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def is_valid_image(file_storage):
    """Verify file content is actually an image, not just named like one."""
    try:
        img = Image.open(file_storage)
        img.verify()
        file_storage.seek(0)
        return True
    except Exception:
        return False


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


def _verify_character_owner(character):
    """如果角色不属于当前用户，抛 403"""
    if character.user_id != current_user.id:
        if not character.book_id or character.book.user_id != current_user.id:
            abort(403)


@characters_bp.route('/')
@login_required
def index():
    book_id = request.args.get('book_id', type=int)
    books = Book.query.filter_by(user_id=current_user.id).order_by(Book.title).all()
    user_book_ids = [b.id for b in books]
    if book_id:
        if book_id not in user_book_ids:
            abort(403)
        characters = Character.query.filter_by(book_id=book_id).order_by(Character.created_at.desc()).all()
        current_book = Book.query.get(book_id)
    else:
        if user_book_ids:
            characters = Character.query.filter(
                or_(Character.user_id == current_user.id, Character.book_id.in_(user_book_ids))
            ).order_by(Character.created_at.desc()).all()
        else:
            characters = Character.query.filter_by(user_id=current_user.id).order_by(Character.created_at.desc()).all()
        current_book = None
    return render_template('characters/index.html',
                           characters=characters, books=books, current_book=current_book)


@characters_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    books = Book.query.filter_by(user_id=current_user.id).all()
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
            book_id=get_book_id(),
            user_id=current_user.id
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
                if not is_valid_image(file):
                    flash(f'文件「{file.filename}」不是有效图片，已跳过', 'warning')
                    continue
                fn = save_image(file, character.id)
                db.session.add(CharacterImage(character_id=character.id, filename=fn))
        db.session.commit()
        flash(f'人物「{character.name}」创建成功！', 'success')
        return redirect(url_for('books.index', book_id=character.book_id, tab='char', highlight=character.id))
    return render_template('characters/create.html', books=books,
                           preselected_book_id=preselected_book_id)


@characters_bp.route('/<int:id>')
@login_required
def detail(id):
    character = Character.query.get_or_404(id)
    _verify_character_owner(character)
    return render_template('characters/detail.html', character=character)


@characters_bp.route('/<int:id>/edit', methods=['GET', 'POST'])
@login_required
def edit(id):
    character = Character.query.get_or_404(id)
    _verify_character_owner(character)
    books = Book.query.filter_by(user_id=current_user.id).all()
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
@login_required
def delete(id):
    character = Character.query.get_or_404(id)
    _verify_character_owner(character)
    for image in character.images:
        fp = os.path.join(current_app.config['UPLOAD_FOLDER'], image.filename)
        if os.path.exists(fp):
            os.remove(fp)
    # Clean up associations
    Relationship.query.filter(
        (Relationship.character_a_id == id) | (Relationship.character_b_id == id)
    ).delete()
    PlotCharacter.query.filter_by(character_id=id).delete()
    db.session.delete(character)
    db.session.commit()
    book_id = character.book_id
    flash(f'人物「{character.name}」已删除', 'warning')
    return redirect(url_for('books.index', book_id=book_id, tab='char'))


@characters_bp.route('/image/<int:image_id>/delete', methods=['POST'])
@login_required
def delete_image(image_id):
    image = CharacterImage.query.get_or_404(image_id)
    character = Character.query.get(image.character_id)
    if character:
        _verify_character_owner(character)
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
