from flask import Blueprint, request, jsonify
import os
import requests
import re


from sqlalchemy import or_


from extensions import db
from models import User, Dish, DeliveryJob, DeliveryBid, Feedback, KnowledgeItem

assistant_bp = Blueprint("assistant", __name__, url_prefix="/api/assistant")

# Ollama config – read from environment (via .env or shell)
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "phi3:mini")  # default to phi3:mini


def call_ollama_llm(prompt: str) -> str:
    """
    Call a local Ollama model via its HTTP API.
    Uses /api/generate so it works on older Ollama versions.
    """

    url = f"{OLLAMA_URL}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,  # full response in one go
    }

    resp = requests.post(url, json=payload, timeout=120)
    resp.raise_for_status()
    data = resp.json()

    # /api/generate returns: {"response": "...", ...}
    return data.get("response", str(data))


def build_delivery_context_for_llm(user, user_message: str) -> str:
    """
    Build a text block describing current delivery jobs + bids
    so the LLM can answer questions about them.

    We keep it simple but structured.
    """

    # Only bother if the user message is about delivery OR the user is relevant role
    lowered = user_message.lower()
    interested = any(
        kw in lowered
        for kw in ["delivery", "driver", "courier", "job", "bid"]
    ) or user.role in ["courier", "delivery", "staff", "manager", "admin"]

    if not interested:
        return "No delivery context requested."

    # Get open/bidding/assigned jobs
    jobs = DeliveryJob.query.order_by(DeliveryJob.created_at.asc()).all()
    if not jobs:
        return "There are currently no delivery jobs in the system."

    lines = []
    for job in jobs:
        # Basic job info
        job_line = [
            f"Job #{job.id}",
            f"order_id={job.order_id}",
            f"status={job.status}",
            f"address={job.delivery_address}",
        ]
        if job.courier_id:
            job_line.append(f"assigned_courier_id={job.courier_id}")
        if job.agreed_fee is not None:
            job_line.append(f"agreed_fee=${job.agreed_fee:.2f}")

        lines.append(" | ".join(job_line))

        # Bids for this job
        bids = DeliveryBid.query.filter_by(delivery_job_id=job.id).all()
        if not bids:
            lines.append("  - No bids yet for this job.")
        else:
            # Show bids sorted by amount
            bids_sorted = sorted(bids, key=lambda b: b.bid_amount)
            for b in bids_sorted:
                courier_name = getattr(b.courier, "name", None)
                lines.append(
                    f"  - Bid #{b.id} by courier_id={b.courier_id} "
                    f"(name={courier_name}) amount=${b.bid_amount:.2f} "
                    f"eta={b.eta_minutes}min status={b.status}"
                )

    context = "Current delivery jobs and bids:\n" + "\n".join(lines)
    return context

def build_reputation_context_for_llm(user, user_message: str) -> str:
    """
    Build text describing users' reputation:
    - chef ratings, compliments, complaints
    - blacklisted customers, warnings

    Only include if the question seems related OR user is staff/manager/admin.
    """

    lowered = user_message.lower()
    interested = any(
        kw in lowered
        for kw in [
            "complaint",
            "complaints",
            "compliment",
            "compliments",
            "rating",
            "ratings",
            "reputation",
            "blacklist",
            "blacklisted",
            "warning",
            "warnings",
            "chef",
            "hr",
        ]
    ) or user.role in ["staff", "manager", "admin"]

    if not interested:
        return "No reputation context requested."

    lines = []

    # Chef reputation summary
    chefs = User.query.filter(User.role.in_(["chef", "junior_chef"])).all()
    if chefs:
        lines.append("Chef reputation summary:")
        for chef in chefs:
            fb_query = Feedback.query.filter(
                Feedback.target_user_id == chef.id
            )
            compliments = fb_query.filter(Feedback.type == "compliment").count()
            upheld_complaints = fb_query.filter(
                Feedback.type == "complaint",
                Feedback.status == "upheld",
            ).count()
            ratings_rows = fb_query.filter(Feedback.rating.isnot(None)).all()
            avg_rating = None
            if ratings_rows:
                total = sum(
                    f.rating for f in ratings_rows if f.rating is not None
                )
                count = sum(
                    1 for f in ratings_rows if f.rating is not None
                )
                if count > 0:
                    avg_rating = total / count

            lines.append(
                f"- Chef {chef.name} (id={chef.id}, role={chef.role}) | "
                f"avg_rating={avg_rating if avg_rating is not None else 'N/A'} | "
                f"compliments={compliments} | upheld_complaints={upheld_complaints} | "
                f"warnings={chef.warnings} | active={chef.is_active} | "
                f"blacklisted={chef.is_blacklisted}"
            )
    else:
        lines.append("No chefs found for reputation summary.")

    # Customer blacklist & warnings
    customers = User.query.filter(User.role == "customer").all()
    flagged_customers = [
        c for c in customers if c.warnings or c.is_blacklisted
    ]
    if flagged_customers:
        lines.append("Customers with warnings or blacklist status:")
        for cust in flagged_customers:
            lines.append(
                f"- Customer {cust.name} (id={cust.id}) | "
                f"warnings={cust.warnings} | "
                f"blacklisted={cust.is_blacklisted} | active={cust.is_active}"
            )
    else:
        lines.append("No customers with warnings or blacklist status.")

    return "\n".join(lines)


def build_structured_menu_suggestions(user, user_message: str):
    """
    Try to detect dish suggestions from the user's message
    (e.g., 'spicy dishes under $20') and return a structured list of dishes
    that the frontend can add to the cart.

    Returns a list of dicts:
    [
      { "id": 1, "name": "Spicy Ramen", "price": 12.5, "is_vip_only": false },
      ...
    ]
    """

    lowered = user_message.lower()

    # Very simple detection: if the message seems about dishes / food,
    # we try to build suggestions. You can always refine this later.
    dish_related_keywords = ["dish", "dishes", "food", "meal", "order", "spicy"]
    if not any(kw in lowered for kw in dish_related_keywords):
        return []

    query = Dish.query

    # Detect spicy-ish intent
    if any(kw in lowered for kw in ["spicy", "hot", "chili", "chilli"]):
        query = query.filter(
            or_(
                Dish.name.ilike("%spicy%"),
                Dish.description.ilike("%spicy%"),
                Dish.description.ilike("%hot%"),
                Dish.description.ilike("%chili%"),
                Dish.description.ilike("%chilli%"),
            )
        )

    # Try to detect a budget, e.g. "under $20" or "$15"
    budget = None
    m = re.search(r"(\d+(\.\d+)?)", user_message)
    if m:
        try:
            budget = float(m.group(1))
        except ValueError:
            budget = None

    if budget is not None:
        query = query.filter(Dish.price <= budget)

    # Non-VIP users should not get VIP-only dishes in the list
    if user.role != "vip":
        query = query.filter(Dish.is_vip_only == False)

    dishes = (
        query.order_by(Dish.price.asc())
        .limit(10)
        .all()
    )

    items = []
    for d in dishes:
        items.append(
            {
                "id": d.id,
                "name": d.name,
                "price": float(d.price),
                "is_vip_only": bool(d.is_vip_only),
                "image_url": d.image_url,
            }
        )

    return items


def find_best_knowledge_answer(user_message: str):
    """
    Very simple KB search:
    - Look for active KnowledgeItem whose question contains words from the message.
    - Returns the first match for now (good enough for the project).
    """
    text = (user_message or "").strip()
    if not text:
        return None

    # For simplicity, look for any KnowledgeItem whose question contains
    # at least one keyword from the message.
    keywords = [w for w in text.lower().split() if len(w) > 3]
    if not keywords:
        keywords = [text.lower()]

    query = KnowledgeItem.query.filter_by(is_active=True)

    filters = []
    for kw in keywords[:5]:  # limit to first 5 words
        filters.append(KnowledgeItem.question_text.ilike(f"%{kw}%"))

    if filters:
        query = query.filter(or_(*filters))

    # Just pick the most recent matching item
    return query.order_by(KnowledgeItem.created_at.desc()).first()



@assistant_bp.route("/chat", methods=["POST"])
def chat_with_assistant():
    data = request.get_json() or {}

    user_id = data.get("user_id")
    user_message = (data.get("message") or "").strip()

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    if not user_message:
        return jsonify({"error": "message is required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.is_blacklisted or not user.is_active:
        return jsonify({"error": "User is not allowed to use the assistant"}), 403

    # ---- 1) Try local knowledge base first ----
    kb_item = find_best_knowledge_answer(user_message)
    if kb_item:
        return jsonify(
            {
                "answer": kb_item.answer_text,
                "user_role": user.role,
                "items": [],  # no structured dishes in this path
                "source": "kb",
                "knowledge_id": kb_item.id,
            }
        )
    
    # --- MENU CONTEXT ---
    dishes = Dish.query.order_by(Dish.price.asc()).limit(50).all()
    menu_lines = []
    for d in dishes:
        vip_tag = " (VIP only)" if d.is_vip_only else ""
        menu_lines.append(f"- {d.name}{vip_tag}: ${d.price:.2f} — {d.description}")
    menu_text = "\n".join(menu_lines) if menu_lines else "No dishes available."

    # --- DELIVERY & REPUTATION CONTEXT (if you already have these) ---
    delivery_context = build_delivery_context_for_llm(user, user_message)
    reputation_context = build_reputation_context_for_llm(user, user_message)

    # --- NEW: STRUCTURED MENU SUGGESTIONS FOR THIS MESSAGE ---
    structured_items = build_structured_menu_suggestions(user, user_message)
    if structured_items:
        structured_text_lines = [
            f"- #{it['id']} {it['name']}: ${it['price']:.2f}"
            for it in structured_items
        ]
        structured_text = "\n".join(structured_text_lines)
    else:
        structured_text = "None detected for this question."

    prompt = f"""
        You are an AI chatbot helping a restaurant ordering & delivery system.

        The system supports:
        - Customers browsing the menu, placing orders, and seeing deliveries.
        - Staff/managers managing orders, delivery jobs, bids, and HR rules.
        - Couriers bidding on jobs and updating deliveries.

        MENU CONTEXT (database snapshot):
        {menu_text}

        DELIVERY CONTEXT (database snapshot):
        {delivery_context}

        REPUTATION CONTEXT (database snapshot):
        {reputation_context}

        POSSIBLE MATCHING DISHES for this specific question:
        {structured_text}

        The current user has the following role in the system: {user.role}.

        The user says:
        \"\"\"{user_message}\"\"\".

        Rules:
        - If the user asks for specific dishes (e.g., spicy dishes under a budget),
        use the "POSSIBLE MATCHING DISHES" list to answer, and prefer those dishes.
        - Do not invent prices or dishes that are not in the context.
        - You can mention dish IDs, names, and prices to make it easy for the system
        to add them to the user's cart.
        - For delivery/bidding questions, rely on DELIVERY CONTEXT.
        - For reputation/HR questions, rely on REPUTATION CONTEXT.
        - If something is not in the context, say you don't know rather than guessing.
        - Keep answers concise but clear.
        """

    try:
        llm_answer = call_ollama_llm(prompt)
    except Exception as e:
        return jsonify(
            {
                "error": "LLM call failed (Ollama). Check that Ollama is running, the URL, and the model name.",
                "details": str(e),
            }
        ), 500

    return jsonify(
        {
            "answer": llm_answer,
            "user_role": user.role,
            "items": structured_items,
            "source": "llm",
        }
    )



@assistant_bp.route("/recommend", methods=["POST"])
def recommend_dishes():
    """
    Simple non-LLM recommendation endpoint.

    Expected JSON body:
    {
      "user_id": 1,
      "max_price": 20.0,          # optional
      "preference": "spicy fish", # optional free text
      "max_results": 5            # optional
    }
    """

    data = request.get_json() or {}

    user_id = data.get("user_id")
    max_price = data.get("max_price")
    preference = (data.get("preference") or "").lower()
    max_results = data.get("max_results", 5)

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.is_blacklisted or not user.is_active:
        return jsonify({"error": "User is not allowed to place orders"}), 403

    # Base query: all dishes
    query = Dish.query

    # Filter by VIP if user is not VIP
    if user.role != "vip":
        query = query.filter_by(is_vip_only=False)

    dishes = query.all()

    # In-memory filtering / scoring
    recommendations = []

    for d in dishes:
        # Filter by budget if provided
        if max_price is not None:
            try:
                if d.price > float(max_price):
                    continue
            except ValueError:
                pass  # ignore bad number, just don't filter

        score = 0

        # Simple scoring based on preference keywords in name/description
        text = f"{d.name} {d.description or ''}".lower()

        if "spicy" in preference and "spicy" in text:
            score += 2
        if "vegan" in preference and "vegan" in text:
            score += 2
        if "fish" in preference and "fish" in text:
            score += 2
        if "meat" in preference and ("beef" in text or "chicken" in text or "meat" in text):
            score += 2
        if "rice" in preference and "rice" in text:
            score += 2

        # Slight preference for cheaper dishes
        score += max(0, 5 - int(d.price // 5))

        recommendations.append((score, d))

    # Sort by score desc, then by price asc
    recommendations.sort(key=lambda pair: (-pair[0], pair[1].price))

    recommendations = recommendations[: max_results or 5]

    result_dishes = []
    for score, d in recommendations:
        result_dishes.append(
            {
                "id": d.id,
                "name": d.name,
                "description": d.description,
                "price": d.price,
                "is_vip_only": d.is_vip_only,
                "score": score,
                "image_url": d.image_url,
            }
        )

    message_parts = []
    if max_price is not None:
        message_parts.append(f"under ${max_price}")
    if preference:
        message_parts.append(f"matching '{preference}'")

    summary = "Recommendations"
    if message_parts:
        summary += " " + " and ".join(message_parts)

    return jsonify(
        {
            "message": summary,
            "user_role": user.role,
            "recommendations": result_dishes,
        }
    )

@assistant_bp.route("/suggest-order", methods=["POST"])
def suggest_order():
    """
    Suggest a simple order for the user using rule-based recommendations.

    Expected JSON body:
    {
      "user_id": 1,
      "max_price": 30.0,   # optional total budget
      "max_items": 3       # optional number of dishes
    }
    """

    data = request.get_json() or {}

    user_id = data.get("user_id")
    max_price = data.get("max_price")
    max_items = data.get("max_items", 3)

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.is_blacklisted or not user.is_active:
        return jsonify({"error": "User is not allowed to place orders"}), 403

    # Base query: all dishes, filter VIP if needed
    query = Dish.query
    if user.role != "vip":
        query = query.filter_by(is_vip_only=False)

    dishes = query.all()
    if not dishes:
        return jsonify({"error": "No dishes available"}), 400

    # Simple scoring: prefer cheaper and varied options
    scored = []
    for d in dishes:
        # base score prefers cheaper dishes
        score = max(0, 10 - int(d.price // 5))

        # tiny bonus for main-like words (purely heuristic)
        text = f"{d.name} {d.description or ''}".lower()
        if "combo" in text or "meal" in text or "plate" in text:
            score += 2

        scored.append((score, d))

    scored.sort(key=lambda pair: (-pair[0], pair[1].price))

    # pick top N
    chosen = scored[: max_items or 3]

    order_items = []
    total_price = 0.0
    for _, d in chosen:
        quantity = 1
        line_total = d.price * quantity
        total_price += line_total
        order_items.append(
            {
                "id": d.id,
                "name": d.name,
                "price": d.price,
                "quantity": quantity,
                "line_total": line_total,
                "is_vip_only": d.is_vip_only,
                "image_url": d.image_url,
            }
        )

    # if a max_price is provided, ensure we don't exceed it too badly
    if max_price is not None:
        try:
            budget = float(max_price)
            # If we're way above budget, trim items
            while total_price > budget and len(order_items) > 1:
                removed = order_items.pop()  # remove last (cheapest/lowest score)
                total_price -= removed["line_total"]
        except ValueError:
            pass  # ignore bad budget, just keep the order

    summary_lines = []
    for item in order_items:
        summary_lines.append(
            f"- {item['name']} x{item['quantity']} (${item['line_total']:.2f})"
        )

    summary_text = "Here is a suggested order:\n" + "\n".join(summary_lines)
    summary_text += f"\n\nEstimated total: ${total_price:.2f}"

    return jsonify(
        {
            "message": summary_text,
            "items": order_items,
            "total_price": total_price,
        }
    )

