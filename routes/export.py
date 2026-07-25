"""导出路由：单章/全书 → TXT / DOCX"""

import io
import zipfile
from flask import Blueprint, Response, send_file, abort
from flask_login import login_required, current_user
from models import Book, Chapter
from docx_utils import (
    build_chapter_docx,
    build_book_docx,
    build_book_txt,
    content_to_txt,
)

export_bp = Blueprint('export', __name__, url_prefix='/export')


# ── 辅助 ─────────────────────────────────────────────────────────

def _safe_filename(name, ext):
    """生成安全的文件名，替换路径非法字符"""
    safe = name.replace('/', '_').replace('\\', '_').replace(':', '_')
    return f'{safe}.{ext}'


def _send_docx(doc, filename):
    """发送 DOCX 文件响应"""
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        as_attachment=True,
        download_name=filename,
    )


def _send_txt(text, filename):
    """发送 TXT 文件响应"""
    buf = io.BytesIO()
    buf.write(text.encode('utf-8'))
    buf.seek(0)
    return send_file(
        buf,
        mimetype='text/plain; charset=utf-8',
        as_attachment=True,
        download_name=filename,
    )


# ═════════════════════════════════════════════════════════════════
# 单章导出
# ═════════════════════════════════════════════════════════════════

@export_bp.route('/chapter/<int:id>/txt')
@login_required
def chapter_txt(id):
    """导出单章为 TXT"""
    chapter = Chapter.query.get_or_404(id)
    if chapter.book is None or chapter.book.user_id != current_user.id:
        abort(403)
    text = content_to_txt(chapter.content or '')
    filename = _safe_filename(chapter.title, 'txt')
    return _send_txt(text, filename)


@export_bp.route('/chapter/<int:id>/docx')
@login_required
def chapter_docx(id):
    """导出单章为 DOCX"""
    chapter = Chapter.query.get_or_404(id)
    if chapter.book is None or chapter.book.user_id != current_user.id:
        abort(403)
    doc = build_chapter_docx(chapter)
    filename = _safe_filename(chapter.title, 'docx')
    return _send_docx(doc, filename)


# ═════════════════════════════════════════════════════════════════
# 全书导出
# ═════════════════════════════════════════════════════════════════

@export_bp.route('/book/<int:book_id>/txt')
@login_required
def book_txt(book_id):
    """导出全书合并 TXT"""
    book = Book.query.get_or_404(book_id)
    if book.user_id != current_user.id:
        abort(403)
    text = build_book_txt(book)
    filename = _safe_filename(book.title, 'txt')
    return _send_txt(text, filename)


@export_bp.route('/book/<int:book_id>/docx')
@login_required
def book_docx(book_id):
    """导出全书合并 DOCX（标准手稿格式）"""
    book = Book.query.get_or_404(book_id)
    if book.user_id != current_user.id:
        abort(403)
    doc = build_book_docx(book)
    filename = _safe_filename(book.title, 'docx')
    return _send_docx(doc, filename)


@export_bp.route('/book/<int:book_id>/docx-zip')
@login_required
def book_docx_zip(book_id):
    """导出全书分章 DOCX，打包为 zip"""
    book = Book.query.get_or_404(book_id)
    if book.user_id != current_user.id:
        abort(403)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for i, chapter in enumerate(book.chapters):
            doc = build_chapter_docx(chapter)
            chapter_buf = io.BytesIO()
            doc.save(chapter_buf)
            chapter_buf.seek(0)
            # 文件名：01_章节标题.docx
            num = str(i + 1).zfill(2)
            fname = _safe_filename(f'{num}_{chapter.title}', 'docx')
            zf.writestr(fname, chapter_buf.read())

    buf.seek(0)
    zip_filename = _safe_filename(f'{book.title}_分章', 'zip')
    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name=zip_filename,
    )
