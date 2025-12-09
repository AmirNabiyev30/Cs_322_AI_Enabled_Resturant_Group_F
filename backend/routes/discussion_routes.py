from datetime import datetime

from flask import Blueprint, request, jsonify

from extensions import db
from models import User, Dish, DiscussionTopic, DiscussionPost

discussion_bp = Blueprint("discussion", __name__, url_prefix="/api/discussion")


def ensure_customer_or_vip(user: User):
    """
    Requirement: registered customers/VIPs can start/participate.
    We enforce that at least customers and VIPs are allowed.
    (Others may be allowed too if you want, but this satisfies the spec.)
    """
    return user.role in ["customer", "vip"]


# --------- Topics ---------


@discussion_bp.route("/topics", methods=["GET"])
def list_topics():
    """
    Optional filters:
      ?target_type=dish|chef|delivery
      &target_id=<id>  (dish.id or user.id)
    """
    target_type = (request.args.get("target_type") or "").strip().lower()
    target_id = request.args.get("target_id")

    query = DiscussionTopic.query

    if target_type in ["dish", "chef", "delivery"]:
        query = query.filter(DiscussionTopic.target_type == target_type)

    if target_id is not None:
        try:
            tid = int(target_id)
        except ValueError:
            return jsonify({"error": "target_id must be an integer"}), 400

        if target_type == "dish":
            query = query.filter(DiscussionTopic.target_dish_id == tid)
        elif target_type in ["chef", "delivery"]:
            query = query.filter(DiscussionTopic.target_user_id == tid)

    topics = query.order_by(DiscussionTopic.created_at.desc()).all()

    result = []
    for t in topics:
        result.append(
            {
                "id": t.id,
                "title": t.title,
                "target_type": t.target_type,
                "target_dish_id": t.target_dish_id,
                "target_user_id": t.target_user_id,
                "created_by_id": t.created_by_id,
                "created_by_name": t.created_by.name if t.created_by else None,
                "created_at": t.created_at.isoformat(),
            }
        )

    return jsonify(result), 200


@discussion_bp.route("/topics", methods=["POST"])
def create_topic():
    """
    Body:
    {
      "user_id": 1,
      "title": "Is Chef Alice's spicy ramen too spicy?",
      "target_type": "dish" | "chef" | "delivery",
      "target_id": 3
    }
    """
    data = request.get_json() or {}

    user_id = data.get("user_id")
    title = (data.get("title") or "").strip()
    target_type = (data.get("target_type") or "").strip().lower()
    target_id = data.get("target_id")

    if not user_id or not title or not target_type or target_id is None:
        return jsonify({"error": "user_id, title, target_type, target_id are required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not user.is_active or user.is_blacklisted:
        return jsonify({"error": "Your account is not active."}), 403

    if not ensure_customer_or_vip(user):
        return jsonify({"error": "Only registered customers or VIPs can start topics."}), 403

    try:
        tid = int(target_id)
    except ValueError:
        return jsonify({"error": "target_id must be an integer"}), 400

    if target_type == "dish":
        dish = Dish.query.get(tid)
        if not dish:
            return jsonify({"error": "Dish not found"}), 404
        topic = DiscussionTopic(
            title=title,
            target_type="dish",
            target_dish_id=dish.id,
            created_by_id=user.id,
        )
    elif target_type in ["chef", "delivery"]:
        target_user = User.query.get(tid)
        if not target_user:
            return jsonify({"error": "Target user not found"}), 404

        # Optional: enforce that the target is actually a chef or delivery role
        if target_type == "chef" and target_user.role not in ["chef", "junior_chef"]:
            return jsonify({"error": "Target is not a chef"}), 400
        if target_type == "delivery" and target_user.role not in ["courier", "delivery"]:
            return jsonify({"error": "Target is not a delivery person"}), 400

        topic = DiscussionTopic(
            title=title,
            target_type=target_type,
            target_user_id=target_user.id,
            created_by_id=user.id,
        )
    else:
        return jsonify({"error": "target_type must be 'dish', 'chef', or 'delivery'"}), 400

    db.session.add(topic)
    db.session.commit()

    return (
        jsonify(
            {
                "id": topic.id,
                "title": topic.title,
                "target_type": topic.target_type,
                "target_dish_id": topic.target_dish_id,
                "target_user_id": topic.target_user_id,
                "created_by_id": topic.created_by_id,
                "created_at": topic.created_at.isoformat(),
            }
        ),
        201,
    )


# --------- Posts in a topic ---------


@discussion_bp.route("/topics/<int:topic_id>/posts", methods=["GET"])
def list_posts(topic_id):
    topic = DiscussionTopic.query.get(topic_id)
    if not topic:
        return jsonify({"error": "Topic not found"}), 404

    posts = (
        DiscussionPost.query.filter_by(topic_id=topic.id, is_deleted=False)
        .order_by(DiscussionPost.created_at.asc())
        .all()
    )

    result = []
    for p in posts:
        result.append(
            {
                "id": p.id,
                "author_id": p.author_id,
                "author_name": p.author.name if p.author else None,
                "content": p.content,
                "created_at": p.created_at.isoformat(),
            }
        )

    return jsonify(
        {
            "topic": {
                "id": topic.id,
                "title": topic.title,
                "target_type": topic.target_type,
                "target_dish_id": topic.target_dish_id,
                "target_user_id": topic.target_user_id,
            },
            "posts": result,
        }
    ), 200


@discussion_bp.route("/topics/<int:topic_id>/posts", methods=["POST"])
def create_post(topic_id):
    """
    Body:
    {
      "user_id": 1,
      "content": "I think Chef Alice's ramen has the perfect level of spice."
    }
    """
    data = request.get_json() or {}

    user_id = data.get("user_id")
    content = (data.get("content") or "").strip()

    if not user_id or not content:
        return jsonify({"error": "user_id and content are required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not user.is_active or user.is_blacklisted:
        return jsonify({"error": "Your account is not active."}), 403

    if not ensure_customer_or_vip(user):
        return jsonify({"error": "Only registered customers or VIPs can post in topics."}), 403

    topic = DiscussionTopic.query.get(topic_id)
    if not topic:
        return jsonify({"error": "Topic not found"}), 404

    post = DiscussionPost(
        topic_id=topic.id,
        author_id=user.id,
        content=content,
    )

    db.session.add(post)
    db.session.commit()

    return (
        jsonify(
            {
                "id": post.id,
                "topic_id": post.topic_id,
                "author_id": post.author_id,
                "author_name": post.author.name if post.author else None,
                "content": post.content,
                "created_at": post.created_at.isoformat(),
            }
        ),
        201,
    )
