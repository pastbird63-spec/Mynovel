from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, abort
from models import db, Book, Chapter, Character, CharacterField, CharacterImage, PlotNode, PlotField, PlotCharacter, WorldSetting, WorldSettingField, WORLD_SETTING_CATEGORIES

chapters_bp = Blueprint('chapters', __name__)


# ═════════════════════════════════════════════════════════════════════
# 页面路由
# ═════════════════════════════════════════════════════════════════════

@chapters_bp.route('/books/<int:book_id>/chapters')
def list_page(book_id):
    """章节列表页"""
    book = Book.query.get_or_404(book_id)
    return render_template('chapters/list.html', book=book)


@chapters_bp.route('/chapters/<int:id>/write')
def write_page(id):
    """稿纸编辑器页"""
    chapter = Chapter.query.get_or_404(id)
    book = Book.query.get(chapter.book_id) if chapter.book_id else None
    return render_template('chapters/write.html', chapter=chapter, book=book)


# ═════════════════════════════════════════════════════════════════════
# API 路由
# ═════════════════════════════════════════════════════════════════════

@chapters_bp.route('/api/books/<int:book_id>/chapters')
def api_list(book_id):
    """获取书的章节列表 JSON"""
    book = Book.query.get_or_404(book_id)
    chapters = Chapter.query.filter_by(book_id=book_id)\
        .order_by(Chapter.order, Chapter.created_at).all()
    return jsonify([{
        'id': c.id,
        'title': c.title,
        'order': c.order,
        'word_count': len(c.content or ''),
        'updated_at': c.updated_at.isoformat() if c.updated_at else None,
    } for c in chapters])


@chapters_bp.route('/api/books/<int:book_id>/chapters', methods=['POST'])
def api_create(book_id):
    """创建新章节"""
    book = Book.query.get_or_404(book_id)
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': '章节标题不能为空'}), 400

    # 新章节 order = 当前最大 order + 1
    max_order = db.session.query(db.func.max(Chapter.order))\
        .filter_by(book_id=book_id).scalar() or 0

    chapter = Chapter(
        book_id=book_id,
        title=title,
        content=data.get('content', ''),
        order=max_order + 1,
    )
    db.session.add(chapter)
    db.session.commit()
    return jsonify({
        'id': chapter.id,
        'title': chapter.title,
        'order': chapter.order,
        'word_count': len(chapter.content or ''),
    }), 201


@chapters_bp.route('/api/chapters/<int:id>')
def api_get(id):
    """获取章节完整内容 JSON"""
    chapter = Chapter.query.get_or_404(id)
    return jsonify({
        'id': chapter.id,
        'book_id': chapter.book_id,
        'title': chapter.title,
        'content': chapter.content or '',
        'order': chapter.order,
        'paper_style': chapter.paper_style or 'lined',
        'paper_color': chapter.paper_color or 'cream',
        'word_count': len(chapter.content or ''),
        'created_at': chapter.created_at.isoformat() if chapter.created_at else None,
        'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
    })


@chapters_bp.route('/api/chapters/<int:id>', methods=['PUT'])
def api_update(id):
    """保存章节内容（自动保存）"""
    chapter = Chapter.query.get_or_404(id)
    data = request.get_json(silent=True) or {}

    if 'title' in data:
        chapter.title = data['title'].strip()
    if 'content' in data:
        chapter.content = data['content']
    if 'paper_style' in data:
        chapter.paper_style = data['paper_style']
    if 'paper_color' in data:
        chapter.paper_color = data['paper_color']

    db.session.commit()
    return jsonify({
        'id': chapter.id,
        'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
    })


@chapters_bp.route('/api/chapters/<int:id>', methods=['DELETE'])
def api_delete(id):
    """删除章节"""
    chapter = Chapter.query.get_or_404(id)
    db.session.delete(chapter)
    db.session.commit()
    return jsonify({'ok': True})


@chapters_bp.route('/api/chapters/<int:id>/reorder', methods=['PUT'])
def api_reorder(id):
    """更新章节排序"""
    chapter = Chapter.query.get_or_404(id)
    data = request.get_json(silent=True) or {}
    new_order = data.get('order')
    if new_order is None:
        return jsonify({'error': '缺少 order'}), 400

    # 批量更新同书内的所有章节顺序
    book_id = chapter.book_id
    order_list = data.get('order_list')
    if order_list and isinstance(order_list, list):
        for item in order_list:
            db.session.query(Chapter).filter_by(id=item['id'])\
                .update({'order': item['order']})
    else:
        chapter.order = new_order

    db.session.commit()
    return jsonify({'ok': True})


# ═════════════════════════════════════════════════════════════════════
# 参考书 API（写作模块侧边栏用）
# ═════════════════════════════════════════════════════════════════════

@chapters_bp.route('/api/books/<int:book_id>/reference/characters')
def api_reference_characters(book_id):
    """获取书的人物列表（只读，供参考书用）"""
    characters = Character.query.filter_by(book_id=book_id)\
        .order_by(Character.name).all()
    return jsonify([{
        'id': c.id,
        'name': c.name,
        'alias': c.alias,
        'age': c.age,
        'gender': c.gender,
        'description': c.description,
    } for c in characters])


@chapters_bp.route('/api/books/<int:book_id>/reference/plots')
def api_reference_plots(book_id):
    """获取书的情节节点列表（只读，供参考书用）"""
    nodes = PlotNode.query.filter_by(book_id=book_id)\
        .order_by(PlotNode.order).all()
    return jsonify([{
        'id': n.id,
        'title': n.title,
        'order': n.order,
        'time_in_story': n.time_in_story,
        'location': n.location,
        'summary': n.summary,
    } for n in nodes])


@chapters_bp.route('/api/books/<int:book_id>/reference/world')
def api_reference_world(book_id):
    """获取书的世界观设定列表（只读，供参考书用）"""
    settings = WorldSetting.query.filter_by(book_id=book_id)\
        .order_by(WorldSetting.category, WorldSetting.created_at).all()
    grouped = {}
    for cat in WORLD_SETTING_CATEGORIES:
        group = [{
            'id': s.id,
            'title': s.title,
            'content': s.content,
        } for s in settings if s.category == cat]
        if group:
            grouped[cat] = group
    return jsonify(grouped)


# ── 参考书详情 API ────────────────────────────────────────────

@chapters_bp.route('/api/reference/character/<int:id>')
def api_reference_character_detail(id):
    """人物详情（含自定义字段和图片）"""
    c = Character.query.get_or_404(id)
    return jsonify({
        'id': c.id,
        'name': c.name,
        'alias': c.alias,
        'age': c.age,
        'gender': c.gender,
        'description': c.description,
        'book_id': c.book_id,
        'custom_fields': [{'name': f.field_name, 'value': f.field_value}
                          for f in c.custom_fields],
        'images': [{'filename': img.filename, 'caption': img.caption}
                   for img in c.images],
    })


@chapters_bp.route('/api/reference/plot/<int:id>')
def api_reference_plot_detail(id):
    """情节节点详情（含自定义字段和关联人物）"""
    n = PlotNode.query.get_or_404(id)
    return jsonify({
        'id': n.id,
        'title': n.title,
        'order': n.order,
        'time_in_story': n.time_in_story,
        'location': n.location,
        'summary': n.summary,
        'custom_fields': [{
            'name': f.field_name,
            'value': f.field_value,
            'is_flagged': f.is_flagged,
            'flag_note': f.flag_note,
        } for f in n.custom_fields],
        'characters': [{
            'id': pc.character.id,
            'name': pc.character.name,
            'role': pc.role_in_plot,
        } for pc in n.plot_characters],
    })


@chapters_bp.route('/api/reference/world/<int:id>')
def api_reference_world_detail(id):
    """世界观设定详情（含自定义字段）"""
    s = WorldSetting.query.get_or_404(id)
    return jsonify({
        'id': s.id,
        'title': s.title,
        'category': s.category,
        'content': s.content,
        'custom_fields': [{'name': f.field_name, 'value': f.field_value}
                          for f in s.fields],
    })
