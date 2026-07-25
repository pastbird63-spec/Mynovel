from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class Book(db.Model):
    __tablename__ = 'books'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    genre = db.Column(db.String(100))
    description = db.Column(db.Text)
    type = db.Column(db.String(10), default='writing')  # 'writing' | 'reading'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    characters = db.relationship('Character', backref='book', lazy=True)
    plot_nodes = db.relationship('PlotNode', backref='book', lazy=True,
                                 order_by='PlotNode.order')
    chapters = db.relationship('Chapter', backref='book', lazy=True,
                               order_by='Chapter.order', cascade='all, delete-orphan')


class Character(db.Model):
    __tablename__ = 'characters'
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id', ondelete='SET NULL'), nullable=True, index=True)
    name = db.Column(db.String(100), nullable=False)
    alias = db.Column(db.String(200))
    age = db.Column(db.String(50))
    gender = db.Column(db.String(20))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    custom_fields = db.relationship('CharacterField', backref='character',
                                    cascade='all, delete-orphan', lazy=True)
    images = db.relationship('CharacterImage', backref='character',
                             cascade='all, delete-orphan', lazy=True)


class CharacterField(db.Model):
    __tablename__ = 'character_fields'
    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False, index=True)
    field_name = db.Column(db.String(100), nullable=False)
    field_value = db.Column(db.Text)


class CharacterImage(db.Model):
    __tablename__ = 'character_images'
    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False, index=True)
    filename = db.Column(db.String(255), nullable=False)
    caption = db.Column(db.String(200))


class Relationship(db.Model):
    __tablename__ = 'relationships'
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id', ondelete='CASCADE'), nullable=True, index=True)
    character_a_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False, index=True)
    character_b_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False, index=True)
    relation_type = db.Column(db.String(100))
    description = db.Column(db.Text)

    character_a = db.relationship('Character', foreign_keys=[character_a_id])
    character_b = db.relationship('Character', foreign_keys=[character_b_id])


class PlotNode(db.Model):
    __tablename__ = 'plot_nodes'
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id', ondelete='CASCADE'), nullable=True, index=True)
    parent_id = db.Column(db.Integer, db.ForeignKey('plot_nodes.id', ondelete='SET NULL'), nullable=True, index=True)
    title = db.Column(db.String(200), nullable=False)
    order = db.Column(db.Integer, default=0)
    time_in_story = db.Column(db.String(200))
    location = db.Column(db.String(200))
    summary = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    children = db.relationship('PlotNode', backref=db.backref('parent', remote_side=[id]), lazy=True)
    custom_fields = db.relationship('PlotField', backref='plot_node',
                                    cascade='all, delete-orphan', lazy=True)
    plot_characters = db.relationship('PlotCharacter', backref='plot_node',
                                      cascade='all, delete-orphan', lazy=True)


class PlotField(db.Model):
    __tablename__ = 'plot_fields'
    id = db.Column(db.Integer, primary_key=True)
    plot_node_id = db.Column(db.Integer, db.ForeignKey('plot_nodes.id', ondelete='CASCADE'), nullable=False, index=True)
    field_name = db.Column(db.String(100), nullable=False)
    field_value = db.Column(db.Text)
    is_flagged = db.Column(db.Boolean, default=False)
    flag_note = db.Column(db.String(200))


class PlotCharacter(db.Model):
    __tablename__ = 'plot_characters'
    id = db.Column(db.Integer, primary_key=True)
    plot_node_id = db.Column(db.Integer, db.ForeignKey('plot_nodes.id', ondelete='CASCADE'), nullable=False, index=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False, index=True)
    role_in_plot = db.Column(db.String(100))
    character = db.relationship('Character')


# ── 新增：世界观设定库 ───────────────────────────────────────────────────────────

WORLD_SETTING_CATEGORIES = ['地理', '规则', '历史', '其他']


class WorldSetting(db.Model):
    __tablename__ = 'world_settings'
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id', ondelete='CASCADE'), nullable=True, index=True)
    category = db.Column(db.String(20), nullable=False, default='其他', index=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    fields = db.relationship('WorldSettingField', backref='setting', cascade='all, delete-orphan', lazy=True)


class WorldSettingField(db.Model):
    __tablename__ = 'world_setting_fields'
    id = db.Column(db.Integer, primary_key=True)
    setting_id = db.Column(db.Integer, db.ForeignKey('world_settings.id', ondelete='CASCADE'), nullable=False, index=True)
    field_name = db.Column(db.String(100), nullable=False)
    field_value = db.Column(db.Text)


class Chapter(db.Model):
    __tablename__ = 'chapters'
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id', ondelete='CASCADE'), nullable=True, index=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default='')
    order = db.Column(db.Integer, default=0)
    paper_style = db.Column(db.String(20), default='lined')
    paper_color = db.Column(db.String(20), default='cream')
    paper_size = db.Column(db.String(10), default='a5')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
