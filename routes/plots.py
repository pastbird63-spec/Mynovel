from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required, current_user
from models import db, PlotNode, PlotField, PlotCharacter, Character, Book

plots_bp = Blueprint('plots', __name__, url_prefix='/plots')


@plots_bp.route('/<int:book_id>')
@login_required
def index(book_id):
    book = Book.query.filter_by(id=book_id, user_id=current_user.id).first_or_404()
    nodes = PlotNode.query.filter_by(book_id=book_id).order_by(PlotNode.order).all()
    # 收集所有有标记的词条，用于顶部提醒
    flagged = PlotField.query.filter_by(is_flagged=True).join(
        PlotNode, PlotField.plot_node_id == PlotNode.id
    ).filter(PlotNode.book_id == book_id).all()
    return render_template('plots/index.html', book=book, nodes=nodes, flagged=flagged)


@plots_bp.route('/<int:book_id>/create', methods=['GET', 'POST'])
@login_required
def create(book_id):
    book = Book.query.filter_by(id=book_id, user_id=current_user.id).first_or_404()
    characters = Character.query.filter_by(book_id=book_id).all()
    parent_nodes = PlotNode.query.filter_by(book_id=book_id).order_by(PlotNode.order).all()

    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        if not title:
            flash('节点标题不能为空', 'danger')
            return redirect(url_for('plots.create', book_id=book_id))

        parent_id_val = request.form.get('parent_id', '').strip()
        parent_id = int(parent_id_val) if parent_id_val else None

        sort_order = request.form.get('sort_order', '').strip()
        if sort_order:
            order_val = int(sort_order)
        else:
            order_val = (db.session.query(db.func.max(PlotNode.order)).filter_by(book_id=book_id).scalar() or 0) + 1

        time_str = request.form.get('time_in_story', '').strip()

        node = PlotNode(
            book_id=book_id,
            parent_id=parent_id,
            title=title,
            order=order_val,
            time_in_story=time_str,
            location=request.form.get('location', ''),
            summary=request.form.get('summary', '')
        )
        db.session.add(node)
        db.session.flush()

        # 描述卡片
        field_names = request.form.getlist('field_name')
        field_values = request.form.getlist('field_value')
        field_flagged = request.form.getlist('field_flagged')

        for i, (fname, fvalue) in enumerate(zip(field_names, field_values)):
            if fname.strip():
                is_flagged = str(i) in field_flagged
                db.session.add(PlotField(
                    plot_node_id=node.id,
                    field_name=fname.strip(),
                    field_value=fvalue.strip(),
                    is_flagged=is_flagged,
                    flag_note=''
                ))

        # 关联人物
        char_ids = request.form.getlist('character_ids')
        for char_id in char_ids:
            db.session.add(PlotCharacter(
                plot_node_id=node.id,
                character_id=int(char_id)
            ))

        db.session.commit()
        flash(f'情节节点「{node.title}」已创建', 'success')
        return redirect(url_for('books.index', book_id=book_id, tab='plot', highlight=node.id))

    next_order = (db.session.query(db.func.max(PlotNode.order)).filter_by(book_id=book_id).scalar() or 0) + 1
    return render_template('plots/create.html', book=book, characters=characters, parent_nodes=parent_nodes, next_order=next_order)


@plots_bp.route('/node/<int:node_id>')
@login_required
def detail(node_id):
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    return render_template('plots/detail.html', node=node)


@plots_bp.route('/node/<int:node_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(node_id):
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    characters = Character.query.filter_by(book_id=node.book_id).all()
    parent_nodes = PlotNode.query.filter_by(book_id=node.book_id).filter(PlotNode.id != node_id).order_by(PlotNode.order).all()
    linked_char_ids = [pc.character_id for pc in node.plot_characters]

    if request.method == 'POST':
        parent_id_val = request.form.get('parent_id', '').strip()
        node.parent_id = int(parent_id_val) if parent_id_val else None
        sort_order = request.form.get('sort_order', '').strip()
        if sort_order: node.order = int(sort_order)
        node.title = request.form.get('title', '').strip()
        node.time_in_story = request.form.get('time_in_story', '').strip()
        node.location = request.form.get('location', '')
        node.summary = request.form.get('summary', '')

        # 重建卡片
        PlotField.query.filter_by(plot_node_id=node.id).delete()
        field_names = request.form.getlist('field_name')
        field_values = request.form.getlist('field_value')
        field_flagged = request.form.getlist('field_flagged')
        for i, (fname, fvalue) in enumerate(zip(field_names, field_values)):
            if fname.strip():
                db.session.add(PlotField(
                    plot_node_id=node.id,
                    field_name=fname.strip(),
                    field_value=fvalue.strip(),
                    is_flagged=str(i) in field_flagged,
                    flag_note=''
                ))

        # 重建人物关联
        PlotCharacter.query.filter_by(plot_node_id=node.id).delete()
        for char_id in request.form.getlist('character_ids'):
            db.session.add(PlotCharacter(plot_node_id=node.id, character_id=int(char_id)))

        db.session.commit()
        flash(f'「{node.title}」已更新', 'success')
        return redirect(url_for('books.index', book_id=node.book_id, tab='plot', highlight=node.id))

    return render_template('plots/edit.html', node=node,
                           characters=characters, linked_char_ids=linked_char_ids, parent_nodes=parent_nodes)


@plots_bp.route('/node/<int:node_id>/reparent', methods=['POST'])
@login_required
def reparent(node_id):
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    parent_id = request.form.get('parent_id', type=int)
    node.parent_id = parent_id
    db.session.commit()
    return ('', 204)


@plots_bp.route('/node/<int:node_id>/unparent', methods=['POST'])
@login_required
def unparent(node_id):
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    node.parent_id = None
    db.session.commit()
    return ('', 204)


@plots_bp.route('/node/<int:node_id>/reorder', methods=['POST'])
@login_required
def reorder(node_id):
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    new_order = request.form.get('order', type=int)
    if new_order is not None:
        node.order = new_order
        db.session.commit()
    return ('', 204)


@plots_bp.route('/node/<int:node_id>/update-field', methods=['POST'])
@login_required
def update_field(node_id):
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    field = request.form.get('field', '')
    value = request.form.get('value', '')
    if field == 'time_in_story':
        node.time_in_story = value
    elif field == 'title':
        node.title = value
    db.session.commit()
    return ('', 204)


@plots_bp.route('/node/<int:node_id>/delete', methods=['POST'])
@login_required
def delete(node_id):
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    book_id = node.book_id
    db.session.delete(node)
    db.session.commit()
    flash(f'节点「{node.title}」已删除', 'warning')
    return redirect(url_for('books.index', book_id=book_id, tab='plot'))


@plots_bp.route('/node/<int:node_id>/move', methods=['POST'])
@login_required
def move(node_id):
    """上移或下移情节节点"""
    node = PlotNode.query.get_or_404(node_id)
    if node.book.user_id != current_user.id:
        abort(403)
    direction = request.form.get('direction')
    book_id = node.book_id

    nodes = PlotNode.query.filter_by(book_id=book_id).order_by(PlotNode.order).all()
    idx = next((i for i, n in enumerate(nodes) if n.id == node_id), None)

    if direction == 'up' and idx and idx > 0:
        nodes[idx].order, nodes[idx - 1].order = nodes[idx - 1].order, nodes[idx].order
        db.session.commit()
    elif direction == 'down' and idx is not None and idx < len(nodes) - 1:
        nodes[idx].order, nodes[idx + 1].order = nodes[idx + 1].order, nodes[idx].order
        db.session.commit()

    return redirect(url_for('plots.index', book_id=book_id))
