from flask import Blueprint, render_template, request, redirect, url_for, flash
from models import db, Book, WorldSetting, WorldSettingField, WORLD_SETTING_CATEGORIES
from datetime import datetime

world_bp = Blueprint('world', __name__, url_prefix='/world')


@world_bp.route('/')
def index():
    category = request.args.get('category', '')
    book_id = request.args.get('book_id', type=int)
    books = Book.query.order_by(Book.title).all()

    query = WorldSetting.query
    if category and category in WORLD_SETTING_CATEGORIES:
        query = query.filter_by(category=category)
    if book_id:
        query = query.filter_by(book_id=book_id)
    settings = query.order_by(WorldSetting.category, WorldSetting.created_at).all()

    grouped = {cat: [s for s in settings if s.category == cat]
               for cat in WORLD_SETTING_CATEGORIES}

    current_book = Book.query.get(book_id) if book_id else None

    return render_template('world/index.html',
                           settings=settings,
                           grouped=grouped,
                           categories=WORLD_SETTING_CATEGORIES,
                           current_category=category,
                           books=books,
                           current_book=current_book)


@world_bp.route('/create', methods=['GET', 'POST'])
def create():
    books = Book.query.order_by(Book.title).all()
    preselected_book_id = request.args.get('book_id', type=int)
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        if not title:
            flash('标题不能为空', 'danger')
            return redirect(url_for('world.create'))
        category = request.form.get('category', '其他')
        if category not in WORLD_SETTING_CATEGORIES:
            category = '其他'
        book_id_val = request.form.get('book_id', '').strip()
        book_id = int(book_id_val) if book_id_val else None
        setting = WorldSetting(
            book_id=book_id,
            title=title,
            category=category,
            content=request.form.get('content', '').strip()
        )
        db.session.add(setting)
        db.session.flush()
        # 保存描述卡片
        for fname, fvalue in zip(request.form.getlist('field_name'), request.form.getlist('field_value')):
            if fname.strip():
                db.session.add(WorldSettingField(setting_id=setting.id, field_name=fname.strip(), field_value=fvalue.strip()))
        db.session.commit()
        flash(f'「{setting.title}」已创建', 'success')
        return redirect(url_for('books.index', book_id=book_id, tab='world', highlight=setting.id))
    return render_template('world/create.html',
                           books=books,
                           categories=WORLD_SETTING_CATEGORIES,
                           preselected_book_id=preselected_book_id)


@world_bp.route('/setting/<int:setting_id>')
def detail(setting_id):
    setting = WorldSetting.query.get_or_404(setting_id)
    return render_template('world/detail.html', setting=setting)


@world_bp.route('/setting/<int:setting_id>/edit', methods=['GET', 'POST'])
def edit(setting_id):
    setting = WorldSetting.query.get_or_404(setting_id)
    books = Book.query.order_by(Book.title).all()
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        if not title:
            flash('标题不能为空', 'danger')
            return redirect(url_for('world.edit', setting_id=setting_id))
        category = request.form.get('category', '其他')
        if category not in WORLD_SETTING_CATEGORIES:
            category = '其他'
        book_id_val = request.form.get('book_id', '').strip()
        setting.book_id = int(book_id_val) if book_id_val else None
        setting.title = title
        setting.category = category
        setting.content = request.form.get('content', '').strip()
        setting.updated_at = datetime.utcnow()
        # 重建描述卡片
        WorldSettingField.query.filter_by(setting_id=setting.id).delete()
        for fname, fvalue in zip(request.form.getlist('field_name'), request.form.getlist('field_value')):
            if fname.strip():
                db.session.add(WorldSettingField(setting_id=setting.id, field_name=fname.strip(), field_value=fvalue.strip()))
        db.session.commit()
        flash(f'「{setting.title}」已更新', 'success')
        return redirect(url_for('books.index', book_id=setting.book_id, tab='world', highlight=setting.id))
    return render_template('world/edit.html',
                           setting=setting,
                           books=books,
                           categories=WORLD_SETTING_CATEGORIES)


@world_bp.route('/setting/<int:setting_id>/delete', methods=['POST'])
def delete(setting_id):
    setting = WorldSetting.query.get_or_404(setting_id)
    title = setting.title
    db.session.delete(setting)
    db.session.commit()
    flash(f'「{title}」已删除', 'warning')
    return redirect(url_for('books.index', book_id=setting.book_id, tab='world'))