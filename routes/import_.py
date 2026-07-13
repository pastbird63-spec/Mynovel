"""导入路由：TXT / DOCX → 章节（支持多文件批量导入）"""

import io
import os
from flask import Blueprint, request, jsonify
from models import db, Book, Chapter
from docx_utils import parse_docx, parse_txt

import_bp = Blueprint('import_', __name__, url_prefix='/import')

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 单个文件最大 2MB
MAX_FILES = 20  # 一次最多导入文件数


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


def _read_text_file(file_storage):
    """读取上传的文本文件，自动尝试 UTF-8 / GBK 编码"""
    file_storage.seek(0, os.SEEK_END)
    size = file_storage.tell()
    file_storage.seek(0)
    if size > MAX_UPLOAD_BYTES:
        raise ValueError(f'文件过大（最大 {MAX_UPLOAD_BYTES // 1024 // 1024}MB）')

    raw = file_storage.read()
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        try:
            return raw.decode('gbk')
        except UnicodeDecodeError:
            raise ValueError('无法识别文件编码，请保存为 UTF-8 或 GBK')


# ═════════════════════════════════════════════════════════════════
# TXT 导入
# ═════════════════════════════════════════════════════════════════

@import_bp.route('/<int:book_id>/txt', methods=['POST'])
def import_txt(book_id):
    """上传一个或多个 TXT 文件，创建章节"""
    Book.query.get_or_404(book_id)

    files = request.files.getlist('files')
    if not files or all(not f.filename for f in files):
        return jsonify({'error': '请选择文件'}), 400

    if len(files) > MAX_FILES:
        return jsonify({'error': f'一次最多导入 {MAX_FILES} 个文件'}), 400

    split = request.form.get('split') == 'true'
    all_created = []
    errors = []

    for file in files:
        if not file.filename:
            continue
        try:
            text = _read_text_file(file)
        except ValueError as e:
            errors.append(f'{file.filename}: {e}')
            continue

        if not text.strip():
            errors.append(f'{file.filename}: 内容为空')
            continue

        # 文件名作为默认章节标题
        default_title = os.path.splitext(file.filename)[0]

        parsed = parse_txt(text, split_by_blank_lines=split)
        for item in parsed:
            if not item['title'].strip():
                item['title'] = default_title

        created = _create_chapters(book_id, parsed)
        all_created.extend(created)

    if not all_created and errors:
        return jsonify({'error': '；'.join(errors)}), 400

    return jsonify({
        'ok': True,
        'created': all_created,
        'total_word_count': sum(c['word_count'] for c in all_created),
        'errors': errors if errors else None,
    }), 201


# ═════════════════════════════════════════════════════════════════
# DOCX 导入
# ═════════════════════════════════════════════════════════════════

@import_bp.route('/<int:book_id>/docx', methods=['POST'])
def import_docx(book_id):
    """上传一个或多个 DOCX 文件，创建章节"""
    Book.query.get_or_404(book_id)

    files = request.files.getlist('files')
    if not files or all(not f.filename for f in files):
        return jsonify({'error': '请选择文件'}), 400

    if len(files) > MAX_FILES:
        return jsonify({'error': f'一次最多导入 {MAX_FILES} 个文件'}), 400

    all_created = []
    errors = []

    for file in files:
        if not file.filename:
            continue

        if not file.filename.lower().endswith('.docx'):
            errors.append(f'{file.filename}: 不是 .docx 文件')
            continue

        # 检查大小
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > MAX_UPLOAD_BYTES:
            errors.append(f'{file.filename}: 文件过大')
            continue

        file_bytes = file.read()

        try:
            parsed = parse_docx(io.BytesIO(file_bytes))
        except Exception as e:
            errors.append(f'{file.filename}: 解析失败（{e}）')
            continue

        if not parsed['chapters']:
            errors.append(f'{file.filename}: 未提取到文字')
            continue

        # 文件名作为默认标题
        default_title = os.path.splitext(file.filename)[0]
        for item in parsed['chapters']:
            if not item['title'].strip():
                item['title'] = default_title

        created = _create_chapters(book_id, parsed['chapters'])
        all_created.extend(created)

    if not all_created and errors:
        return jsonify({'error': '；'.join(errors)}), 400

    return jsonify({
        'ok': True,
        'created': all_created,
        'total_word_count': sum(c['word_count'] for c in all_created),
        'errors': errors if errors else None,
    }), 201
