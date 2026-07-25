from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, abort
from flask_login import login_required, current_user
from models import db, Book, Chapter, Character, CharacterField, CharacterImage, PlotNode, PlotField, PlotCharacter, WorldSetting, WorldSettingField, WORLD_SETTING_CATEGORIES

chapters_bp = Blueprint('chapters', __name__)


# ── 辅助函数 ──────────────────────────────────────────────────────────


def _book_or_abort(book_id):
    """取书并校验归属，不通过则 404"""
    book = Book.query.get_or_404(book_id)
    if book.user_id != current_user.id:
        abort(404)
    return book


def _chapter_or_abort(id):
    """取章节并校验归属，不通过则 404"""
    chapter = Chapter.query.get_or_404(id)
    if not chapter.book_id or chapter.book.user_id != current_user.id:
        abort(404)
    return chapter


def _character_or_abort(id):
    c = Character.query.get_or_404(id)
    if c.book.user_id != current_user.id:
        abort(404)
    return c


def _plot_node_or_abort(id):
    n = PlotNode.query.get_or_404(id)
    if n.book.user_id != current_user.id:
        abort(404)
    return n


def _world_setting_or_abort(id):
    s = WorldSetting.query.get_or_404(id)
    if s.book.user_id != current_user.id:
        abort(404)
    return s


# ═════════════════════════════════════════════════════════════════════
# 页面路由
# ═════════════════════════════════════════════════════════════════════

@chapters_bp.route('/books/<int:book_id>/chapters')
@login_required
def list_page(book_id):
    """章节列表页"""
    book = _book_or_abort(book_id)
    return render_template('chapters/list.html', book=book)


@chapters_bp.route('/chapters/<int:id>/write')
@login_required
def write_page(id):
    """稿纸编辑器页"""
    chapter = _chapter_or_abort(id)
    book = Book.query.get(chapter.book_id) if chapter.book_id else None
    return render_template('chapters/write.html', chapter=chapter, book=book)


# ═════════════════════════════════════════════════════════════════════
# API 路由
# ═════════════════════════════════════════════════════════════════════

@chapters_bp.route('/api/books/<int:book_id>/chapters')
@login_required
def api_list(book_id):
    """获取书的章节列表 JSON"""
    book = _book_or_abort(book_id)
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
@login_required
def api_create(book_id):
    """创建新章节"""
    book = _book_or_abort(book_id)
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
@login_required
def api_get(id):
    """获取章节完整内容 JSON"""
    chapter = _chapter_or_abort(id)
    return jsonify({
        'id': chapter.id,
        'book_id': chapter.book_id,
        'title': chapter.title,
        'content': chapter.content or '',
        'order': chapter.order,
        'paper_style': chapter.paper_style or 'lined',
        'paper_color': chapter.paper_color or 'cream',
        'paper_size': chapter.paper_size or 'a5',
        'word_count': len(chapter.content or ''),
        'created_at': chapter.created_at.isoformat() if chapter.created_at else None,
        'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
    })


@chapters_bp.route('/api/chapters/<int:id>/neighbors')
@login_required
def api_neighbors(id):
    """返回同一本书中当前章节的前后章节 ID"""
    chapter = _chapter_or_abort(id)
    if not chapter.book_id:
        return jsonify({'prev': None, 'next': None})
    # 前一章：同书 order 小于当前的最大 order
    prev_ch = Chapter.query.filter(
        Chapter.book_id == chapter.book_id,
        Chapter.order < chapter.order
    ).order_by(Chapter.order.desc()).first()
    # 后一章：同书 order 大于当前的最小 order
    next_ch = Chapter.query.filter(
        Chapter.book_id == chapter.book_id,
        Chapter.order > chapter.order
    ).order_by(Chapter.order.asc()).first()
    return jsonify({
        'prev': {'id': prev_ch.id, 'title': prev_ch.title} if prev_ch else None,
        'next': {'id': next_ch.id, 'title': next_ch.title} if next_ch else None,
    })


@chapters_bp.route('/api/chapters/<int:id>', methods=['PUT'])
@login_required
def api_update(id):
    """保存章节内容（自动保存）"""
    chapter = _chapter_or_abort(id)
    data = request.get_json(silent=True) or {}

    if 'title' in data:
        chapter.title = data['title'].strip()
    if 'content' in data:
        chapter.content = data['content']
    if 'paper_style' in data:
        chapter.paper_style = data['paper_style']
    if 'paper_color' in data:
        chapter.paper_color = data['paper_color']
    if 'paper_size' in data:
        chapter.paper_size = data['paper_size']

    db.session.commit()
    return jsonify({
        'id': chapter.id,
        'updated_at': chapter.updated_at.isoformat() if chapter.updated_at else None,
    })


@chapters_bp.route('/api/chapters/<int:id>', methods=['DELETE'])
@login_required
def api_delete(id):
    """删除章节"""
    chapter = _chapter_or_abort(id)
    db.session.delete(chapter)
    db.session.commit()
    return jsonify({'ok': True})


@chapters_bp.route('/api/chapters/<int:id>/reorder', methods=['PUT'])
@login_required
def api_reorder(id):
    """更新章节排序"""
    chapter = _chapter_or_abort(id)
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
@login_required
def api_reference_characters(book_id):
    """获取书的人物列表（只读，供参考书用）"""
    book = _book_or_abort(book_id)
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
@login_required
def api_reference_plots(book_id):
    """获取书的情节节点列表（只读，供参考书用）"""
    book = _book_or_abort(book_id)
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
@login_required
def api_reference_world(book_id):
    """获取书的世界观设定列表（只读，供参考书用）"""
    book = _book_or_abort(book_id)
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
@login_required
def api_reference_character_detail(id):
    """人物详情（含自定义字段和图片）"""
    c = _character_or_abort(id)
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
@login_required
def api_reference_plot_detail(id):
    """情节节点详情（含自定义字段和关联人物）"""
    n = _plot_node_or_abort(id)
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
@login_required
def api_reference_world_detail(id):
    """世界观设定详情（含自定义字段）"""
    s = _world_setting_or_abort(id)
    return jsonify({
        'id': s.id,
        'title': s.title,
        'category': s.category,
        'content': s.content,
        'custom_fields': [{'name': f.field_name, 'value': f.field_value}
                          for f in s.fields],
    })


# ═════════════════════════════════════════════════════════════════════
# 快速 CRUD API（供参考书侧栏用，JSON 入/出）
# ═════════════════════════════════════════════════════════════════════

# ── 人物 ──────────────────────────────────────────────────────────

@chapters_bp.route('/api/books/<int:book_id>/characters/quick', methods=['POST'])
@login_required
def api_quick_create_character(book_id):
    book = _book_or_abort(book_id)
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '名称不能为空'}), 400
    character = Character(
        book_id=book_id,
        name=name,
        alias=(data.get('alias') or '').strip(),
        age=(data.get('age') or '').strip(),
        gender=(data.get('gender') or '').strip(),
        description=(data.get('description') or '').strip(),
    )
    db.session.add(character)
    db.session.commit()
    return jsonify({
        'id': character.id,
        'name': character.name,
        'alias': character.alias,
        'age': character.age,
        'gender': character.gender,
        'description': character.description,
    }), 201


@chapters_bp.route('/api/characters/<int:id>/quick', methods=['PUT'])
@login_required
def api_quick_update_character(id):
    character = _character_or_abort(id)
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        character.name = data['name'].strip()
    if 'alias' in data:
        character.alias = (data['alias'] or '').strip()
    if 'age' in data:
        character.age = (data['age'] or '').strip()
    if 'gender' in data:
        character.gender = (data['gender'] or '').strip()
    if 'description' in data:
        character.description = (data['description'] or '').strip()
    db.session.commit()
    return jsonify({'ok': True, 'id': character.id})


# ── 情节 ──────────────────────────────────────────────────────────

@chapters_bp.route('/api/books/<int:book_id>/plots/quick', methods=['POST'])
@login_required
def api_quick_create_plot(book_id):
    book = _book_or_abort(book_id)
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': '标题不能为空'}), 400

    max_order = db.session.query(db.func.max(PlotNode.order))\
        .filter_by(book_id=book_id).scalar() or 0

    node = PlotNode(
        book_id=book_id,
        title=title,
        order=max_order + 1,
        time_in_story=(data.get('time_in_story') or '').strip(),
        location=(data.get('location') or '').strip(),
        summary=(data.get('summary') or '').strip(),
    )
    db.session.add(node)
    db.session.commit()
    return jsonify({
        'id': node.id,
        'title': node.title,
        'order': node.order,
        'time_in_story': node.time_in_story,
        'location': node.location,
        'summary': node.summary,
    }), 201


@chapters_bp.route('/api/plot-nodes/<int:id>/quick', methods=['PUT'])
@login_required
def api_quick_update_plot(id):
    node = _plot_node_or_abort(id)
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        node.title = data['title'].strip()
    if 'time_in_story' in data:
        node.time_in_story = (data['time_in_story'] or '').strip()
    if 'location' in data:
        node.location = (data['location'] or '').strip()
    if 'summary' in data:
        node.summary = (data['summary'] or '').strip()
    db.session.commit()
    return jsonify({'ok': True, 'id': node.id})


# ── 世界观 ────────────────────────────────────────────────────────

@chapters_bp.route('/api/books/<int:book_id>/world/quick', methods=['POST'])
@login_required
def api_quick_create_world(book_id):
    book = _book_or_abort(book_id)
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': '标题不能为空'}), 400

    category = data.get('category', '其他')
    if category not in WORLD_SETTING_CATEGORIES:
        category = '其他'

    setting = WorldSetting(
        book_id=book_id,
        title=title,
        category=category,
        content=(data.get('content') or '').strip(),
    )
    db.session.add(setting)
    db.session.commit()
    return jsonify({
        'id': setting.id,
        'title': setting.title,
        'category': setting.category,
        'content': setting.content,
    }), 201


@chapters_bp.route('/api/world-settings/<int:id>/quick', methods=['PUT'])
@login_required
def api_quick_update_world(id):
    setting = _world_setting_or_abort(id)
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        setting.title = data['title'].strip()
    if 'category' in data:
        cat = data['category']
        if cat in WORLD_SETTING_CATEGORIES:
            setting.category = cat
    if 'content' in data:
        setting.content = (data['content'] or '').strip()
    from datetime import datetime
    setting.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'ok': True, 'id': setting.id})
