from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, abort
from flask_login import login_required, current_user
from models import db, Relationship, Character, Book

relationships_bp = Blueprint('relationships', __name__, url_prefix='/relationships')


@relationships_bp.route('/<int:book_id>')
@login_required
def graph(book_id):
    book = Book.query.get_or_404(book_id)
    if book.user_id != current_user.id:
        abort(403)
    characters = Character.query.filter_by(book_id=book_id).all()
    relationships = Relationship.query.filter_by(book_id=book_id).all()

    # 把人物和关系转成 JSON 格式，传给前端 vis.js 使用
    nodes = [
        {
            'id': c.id,
            'label': c.name,
            'title': f"{c.name}{'（' + c.alias + '）' if c.alias else ''}",
            'url': url_for('characters.detail', id=c.id)
        }
        for c in characters
    ]
    edges = [
        {
            'id': r.id,
            'from': r.character_a_id,
            'to': r.character_b_id,
            'label': r.relation_type or '',
            'title': r.description or ''
        }
        for r in relationships
    ]

    return render_template('relationships/graph.html',
                           book=book,
                           characters=characters,
                           relationships=relationships,
                           nodes=nodes,
                           edges=edges)


@relationships_bp.route('/<int:book_id>/add', methods=['POST'])
@login_required
def add(book_id):
    book = Book.query.get_or_404(book_id)
    if book.user_id != current_user.id:
        abort(403)
    a_id = request.form.get('character_a_id', type=int)
    b_id = request.form.get('character_b_id', type=int)
    if not a_id or not b_id:
        flash('请选择两个人物', 'danger')
        return redirect(url_for('relationships.graph', book_id=book_id))
    if a_id == b_id:
        flash('不能与自己建立关系', 'danger')
        return redirect(url_for('relationships.graph', book_id=book_id))

    rel = Relationship(
        book_id=book_id,
        character_a_id=a_id,
        character_b_id=b_id,
        relation_type=request.form.get('relation_type', ''),
        description=request.form.get('description', '')
    )
    db.session.add(rel)
    db.session.commit()
    flash('关系已添加', 'success')
    return redirect(url_for('relationships.graph', book_id=book_id))


@relationships_bp.route('/<int:rel_id>/delete', methods=['POST'])
@login_required
def delete(rel_id):
    rel = Relationship.query.get_or_404(rel_id)
    book = Book.query.get_or_404(rel.book_id)
    if book.user_id != current_user.id:
        abort(403)
    book_id = rel.book_id
    db.session.delete(rel)
    db.session.commit()
    flash('关系已删除', 'success')
    return redirect(url_for('relationships.graph', book_id=book_id))
