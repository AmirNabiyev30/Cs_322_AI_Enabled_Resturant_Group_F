from flask import Blueprint, request, jsonify
from extensions import db
from models import User, KnowledgeItem

knowledge_bp = Blueprint("knowledge", __name__, url_prefix="/api/knowledge")


def require_manager(user: User):
    return user and user.role in ["manager", "admin", "staff"]


@knowledge_bp.route("/add", methods=["POST"])
def add_knowledge_item():
    """
    Employees or customers can add Q&A knowledge to the local KB.

    Body:
    {
      "user_id": 1,
      "question": "What are your opening hours?",
      "answer":  "We are open from 10am to 10pm..."
    }
    """
    data = request.get_json() or {}
    user_id = data.get("user_id")
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()

    if not user_id or not question or not answer:
        return jsonify({"error": "user_id, question, and answer are required"}), 400

    author = User.query.get(user_id)
    if not author:
        return jsonify({"error": "Author not found"}), 404

    if not author.can_answer_kb:
        return jsonify({"error": "You are not allowed to add KB answers."}), 403

    # Classify simple source_type based on role
    role_to_source = {
        "chef": "chef",
        "junior_chef": "chef",
        "delivery": "delivery",
        "courier": "delivery",
        "manager": "manager",
        "admin": "manager",
        "staff": "manager",
    }
    source_type = role_to_source.get(author.role, "customer")

    item = KnowledgeItem(
        question_text=question,
        answer_text=answer,
        author_id=author.id,
        source_type=source_type,
    )
    db.session.add(item)
    db.session.commit()

    return jsonify(
        {
            "message": "Knowledge item added.",
            "knowledge_id": item.id,
        }
    ), 201


@knowledge_bp.route("/rate", methods=["POST"])
def rate_knowledge_item():
    """
    Rate a KB answer (0-5).
    If rating == 0, flag the item for manager review.

    Body:
    {
      "user_id": 5,
      "knowledge_id": 10,
      "score": 3
    }
    """
    data = request.get_json() or {}
    user_id = data.get("user_id")
    knowledge_id = data.get("knowledge_id")
    score = data.get("score")

    if user_id is None or knowledge_id is None or score is None:
        return jsonify({"error": "user_id, knowledge_id, and score are required"}), 400

    try:
        score = int(score)
    except ValueError:
        return jsonify({"error": "score must be an integer between 0 and 5"}), 400

    if score < 0 or score > 5:
        return jsonify({"error": "score must be between 0 and 5"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    item = KnowledgeItem.query.get(knowledge_id)
    if not item or not item.is_active:
        return jsonify({"error": "Knowledge item not found or inactive"}), 404

    # Update rating stats
    item.rating_sum += score
    item.rating_count += 1

    message = "Rating recorded."
    if score == 0:
        item.flagged = True
        message += " This answer has been flagged for manager review."

    db.session.commit()

    return jsonify(
        {
            "message": message,
            "average_rating": item.rating_sum / item.rating_count
            if item.rating_count
            else None,
        }
    )


@knowledge_bp.route("/flagged", methods=["GET"])
def list_flagged_items():
    """
    Manager endpoint: list flagged KB items that need review.
    """
    manager_id = request.args.get("manager_id", type=int)
    manager = User.query.get(manager_id) if manager_id else None

    if not manager or not require_manager(manager):
        return jsonify({"error": "Only manager/staff can view flagged items."}), 403

    items = KnowledgeItem.query.filter_by(flagged=True, is_active=True).all()
    data = []
    for it in items:
        data.append(
            {
                "id": it.id,
                "question": it.question_text,
                "answer": it.answer_text,
                "author_id": it.author_id,
                "author_name": it.author.name if it.author else None,
                "source_type": it.source_type,
                "rating_sum": it.rating_sum,
                "rating_count": it.rating_count,
                "created_at": it.created_at.isoformat(),
            }
        )

    return jsonify({"flagged_items": data})


@knowledge_bp.route("/moderate", methods=["POST"])
def moderate_knowledge_item():
    """
    Manager decides what to do with a flagged KB item.

    Body:
    {
      "manager_id": 1,
      "knowledge_id": 10,
      "action": "keep" | "remove_ban"
    }
    """
    data = request.get_json() or {}
    manager_id = data.get("manager_id")
    knowledge_id = data.get("knowledge_id")
    action = data.get("action")

    manager = User.query.get(manager_id)
    if not manager or not require_manager(manager):
        return jsonify({"error": "Only manager/staff can moderate KB."}), 403

    item = KnowledgeItem.query.get(knowledge_id)
    if not item:
        return jsonify({"error": "Knowledge item not found"}), 404

    if action == "keep":
        # Just clear the flag
        item.flagged = False
        db.session.commit()
        return jsonify({"message": "Flag cleared; item kept."})

    elif action == "remove_ban":
        # Deactivate the item and ban the author from adding future KB
        item.is_active = False
        item.flagged = False
        if item.author:
            item.author.can_answer_kb = False
        db.session.commit()
        return jsonify(
            {
                "message": "Item removed. Author is no longer allowed to add KB answers."
            }
        )

    else:
        return jsonify({"error": "Unknown action. Use 'keep' or 'remove_ban'."}), 400
