from datetime import datetime
from extensions import db

class User(db.Model):
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), default="customer")

    # who can answer KB
    can_answer_kb = db.Column(db.Boolean, default=False)

    # manager-controlled employment + pay
    pay_rate = db.Column(db.Float, default=0.0)
    is_employed = db.Column(db.Boolean, default=True)

    deposit_balance = db.Column(db.Float, default=0.0)
    total_spent = db.Column(db.Float, default=0.0)
    order_count = db.Column(db.Integer, default=0)
    warnings = db.Column(db.Integer, default=0)
    is_blacklisted = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)

    # NEW: VIP loyalty tracking
    vip_free_delivery_credits = db.Column(db.Integer, default=0)
    vip_orders_since_last_free = db.Column(db.Integer, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # SIMPLE VERSION FOR CLASS PROJECT (NO HASHING)
    def set_password(self, password: str) -> None:
        """Store the password as plain text (NOT for production)."""
        self.password_hash = password

    def check_password(self, password: str) -> bool:
        """Plain text compare."""
        return self.password_hash == password





class Dish(db.Model):
    __tablename__ = "dish"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    price = db.Column(db.Float, nullable=False)

    image_url = db.Column(db.String(500))
    is_vip_only = db.Column(db.Boolean, default=False)

    chef_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    chef = db.relationship("User", backref="dishes")


class Order(db.Model):
    __tablename__ = "order"

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    status = db.Column(db.String(20), default="pending")
    total_price = db.Column(db.Float, default=0.0)
    discount_applied = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    customer = db.relationship("User", backref="orders")


class OrderItem(db.Model):
    __tablename__ = "order_item"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False)
    dish_id = db.Column(db.Integer, db.ForeignKey("dish.id"), nullable=False)

    quantity = db.Column(db.Integer, default=1)
    unit_price = db.Column(db.Float, nullable=False)

    order = db.relationship("Order", backref="items")
    dish = db.relationship("Dish")


class Feedback(db.Model):
    __tablename__ = "feedback"

    id = db.Column(db.Integer, primary_key=True)

    # 'complaint' or 'compliment'
    type = db.Column(db.String(20), nullable=False)

    accuser_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    target_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=True)

    # Optional rating, e.g. 1–5 (mainly for compliments / chef ratings)
    rating = db.Column(db.Integer, nullable=True)

    reason = db.Column(db.Text, nullable=True)

    # For complaints: 'pending', 'upheld', 'dismissed', 'cancelled_by_compliment'
    # For compliments: 'applied'
    status = db.Column(db.String(32), default="pending", nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime, nullable=True)

    manager_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    accuser = db.relationship(
        "User", foreign_keys=[accuser_id], backref="filed_feedback", lazy=True
    )
    target_user = db.relationship(
        "User", foreign_keys=[target_user_id], backref="received_feedback", lazy=True
    )
    manager = db.relationship(
        "User", foreign_keys=[manager_id], backref="handled_feedback", lazy=True
    )
    order = db.relationship("Order", backref="feedback", lazy=True)



class DeliveryJob(db.Model):
    __tablename__ = "delivery_jobs"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    # Who accepted the job
    courier_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    # Address info (simplified)
    delivery_address = db.Column(db.String(255), nullable=False)
    delivery_notes = db.Column(db.String(255), nullable=True)

    # Status: "open", "bidding", "assigned", "picked_up", "delivered", "cancelled"
    status = db.Column(db.String(32), default="open", nullable=False)

    # The delivery fee agreed in the accepted bid
    agreed_fee = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    order = db.relationship("Order", backref="delivery_job", lazy=True)
    customer = db.relationship(
        "User", foreign_keys=[customer_id], backref="delivery_requests", lazy=True
    )
    courier = db.relationship(
        "User", foreign_keys=[courier_id], backref="delivery_assignments", lazy=True
    )

    bids = db.relationship(
        "DeliveryBid",
        backref="delivery_job",
        lazy=True,
        cascade="all, delete-orphan",
    )


class DeliveryBid(db.Model):
    __tablename__ = "delivery_bids"

    id = db.Column(db.Integer, primary_key=True)
    delivery_job_id = db.Column(
        db.Integer, db.ForeignKey("delivery_jobs.id"), nullable=False
    )
    courier_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    bid_amount = db.Column(db.Float, nullable=False)  # how much the courier wants
    eta_minutes = db.Column(db.Integer, nullable=True)  # estimate for delivery

    # "pending", "accepted", "rejected"
    status = db.Column(db.String(32), default="pending", nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    courier = db.relationship("User", backref="delivery_bids", lazy=True)


class KnowledgeItem(db.Model):
    __tablename__ = "knowledge_items"

    id = db.Column(db.Integer, primary_key=True)
    question_text = db.Column(db.Text, nullable=False)
    answer_text = db.Column(db.Text, nullable=False)

    author_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    author = db.relationship("User", backref="knowledge_items")

    source_type = db.Column(
        db.String(20),
        default="customer",
    )  # "customer", "chef", "delivery", "manager", "system"

    rating_sum = db.Column(db.Integer, default=0)
    rating_count = db.Column(db.Integer, default=0)

    flagged = db.Column(db.Boolean, default=False)  # rating 0 triggers this
    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class DiscussionTopic(db.Model):
    __tablename__ = "discussion_topics"

    id = db.Column(db.Integer, primary_key=True)

    # Title of the thread
    title = db.Column(db.String(200), nullable=False)

    # What is the topic about?
    # "dish", "chef", or "delivery"
    target_type = db.Column(db.String(20), nullable=False)

    # For dishes
    target_dish_id = db.Column(db.Integer, db.ForeignKey("dish.id"), nullable=True)

    # For chefs or delivery people (User)
    target_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

    # Who started the topic
    created_by_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    created_by = db.relationship("User", foreign_keys=[created_by_id], backref="discussion_topics_started")
    target_user = db.relationship("User", foreign_keys=[target_user_id], backref="discussion_topics_about")
    target_dish = db.relationship("Dish", backref="discussion_topics")


class DiscussionPost(db.Model):
    __tablename__ = "discussion_posts"

    id = db.Column(db.Integer, primary_key=True)
    topic_id = db.Column(db.Integer, db.ForeignKey("discussion_topics.id"), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    is_deleted = db.Column(db.Boolean, default=False)

    topic = db.relationship("DiscussionTopic", backref="posts", lazy=True)
    author = db.relationship("User", backref="discussion_posts", lazy=True)
  