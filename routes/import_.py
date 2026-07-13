"""导入路由：TXT / DOCX → 章节"""

import io
import os
from flask import Blueprint, request, jsonify
from models import db, Book, Chapter
from docx_utils import parse_docx, parse_txt

import_bp = Blueprint('import_', __name__, url_prefix='/import')

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2MB


# ── 辅助 ─────────────────────────────────────────────────────────

def _max_order(book_id):
    """当前书的最大章节 order"""
    result = db.session.query(db.func.max(Chapter.order))\
        .filter_by(book_id=book_id).scalar() or 0
    return result


def _create_chapters(book_id, parsed_chapters):
    """批量创建章节，返回创建结果列表"""
    order = _max_order(book_id)
    created = []
    for item in parsed_chapters:
        title = (item.get('title') or '').strip()
        if not title:
            title = '未命名章节'
        order += 1
        chapter = Chapter(
            book_id=book_id,
            title=title,
            content=item.get('content', ''),
            order=order,
        )
        db.session.add(chapter)
        created.append(chapter)
    db.session.commit()
    return [{
        'id': c.id,
        'title': c.title,
        'order': c.order,
        'word_count': len(c.content or ''),
    } for c in created]


# ═════════════════════════════════════════════════════════════════
# TXT 导入
# ═════════════════════════════════════════════════════════════════

@import_bp.route('/<int:book_id>/txt', methods=['POST'])
def import_txt(book_id):
    """上传 TXT 文件，创建章节"""
    Book.query.get_or_404(book_id)

    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': '请选择文件'}), 400

    # 检查大小
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_UPLOAD_BYTES:
        return jsonify({'error': f'文件过大（最大 {MAX_UPLOAD_BYTES // 1024 // 1024}MB）'}), 400

    # 读取内容
    raw = file.read()
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = raw.decode('gbk')
        except UnicodeDecodeError:
            return jsonify({'error': '无法识别文件编码，请保存为 UTF-8 或 GBK'}), 400

    if not text.strip():
        return jsonify({'error': '文件内容为空'}), 400

    # 解析
    split = request.form.get('split') == 'true'
    parsed = parse_txt(text, split_by_blank_lines=split)

    # 如果没有标题，用文件名
    if parsed:
        default_title = os.path.splitext(file.filename)[0]
        for item in parsed:
            if not item['title'].strip():
                item['title'] = default_title

    # 创建章节
    created = _create_chapters(book_id, parsed)

    return jsonify({
        'ok': True,
        'created': created,
        'total_word_count': sum(c['word_count'] for c in created),
    }), 201


# ═════════════════════════════════════════════════════════════════
# DOCX 导入
# ═════════════════════════════════════════════════════════════════

@import_bp.route('/<int:book_id>/docx', methods=['POST'])
def import_docx(book_id):
    """上传 DOCX 文件，创建章节"""
    Book.query.get_or_404(book_id)

    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': '请选择文件'}), 400

    # 检查扩展名
    if not file.filename.lower().endswith('.docx'):
        return jsonify({'error': '请上传 .docx 文件'}), 400

    # 检查大小
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_UPLOAD_BYTES:
        return jsonify({'error': f'文件过大（最大 {MAX_UPLOAD_BYTES // 1024 // 1024}MB）'}), 400

    # 保存临时文件（python-docx 需要文件路径或类文件对象）
    file_bytes = file.read()

    try:
        parsed = parse_docx(io.BytesIO(file_bytes))
    except Exception as e:
        return jsonify({'error': f'解析 DOCX 失败：{str(e)}'}), 400

    if not parsed['chapters']:
        return jsonify({'error': '未能从文件中提取到文字内容'}), 400

    # 如果没有章节标题，用文件名
    default_title = os.path.splitext(file.filename)[0]
    for item in parsed['chapters']:
        if not item['title'].strip():
            item['title'] = default_title

    # 创建章节
    created = _create_chapters(book_id, parsed['chapters'])

    return jsonify({
        'ok': True,
        'created': created,
        'total_word_count': sum(c['word_count'] for c in created),
    }), 201
