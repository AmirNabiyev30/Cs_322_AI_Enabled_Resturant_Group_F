from flask import Blueprint, request, jsonify

from extensions import db
from models import User, Dish, Order, OrderItem, DeliveryJob, Feedback

order_bp = Blueprint("orders", __name__, url_prefix="/api/orders")


def maybe_update_vip_status(user: User) -> bool:
    """
    Promote a registered customer to VIP if:
      - user.role == 'customer'
      - total_spent > 100  OR  order_count >= 3
      - and there are NO outstanding complaints
        (complaints with status 'pending' or 'upheld')

    Returns True if the user was just promoted in this call, else False.
    """
    # Only registered customers can be promoted
    if user.role != "customer":
        return False

    # Check for outstanding complaints about this user
    active_complaints = Feedback.query.filter(
        Feedback.target_user_id == user.id,
        Feedback.type == "complaint",
        Feedback.status.in_(["pending", "upheld"]),
    ).count()

    if active_complaints > 0:
        # Spec: must have no outstanding complaints
        return False

    # Business rule: more than $100 OR at least 3 orders
    qualifies_by_spend = user.total_spent > 100
    qualifies_by_orders = user.order_count >= 3

    if qualifies_by_spend or qualifies_by_orders:
        user.role = "vip"
        # you can choose to clear warnings on promotion or not; I’ll leave them as-is
        return True

    return False



@order_bp.route("/", methods=["POST"])
def create_order():
    """
    Create a new order.

    Expected JSON body:
    {
      "user_id": 1,
      "items": [
        {"dish_id": 1, "quantity": 2},
        {"dish_id": 3, "quantity": 1}
      ]
    }
    """
    data = request.get_json() or {}

    user_id = data.get("user_id")
    items = data.get("items", [])

    if not user_id or not items:
        return jsonify({"error": "user_id and items are required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.is_blacklisted or not user.is_active:
        return jsonify({"error": "User is not allowed to place orders"}), 403

    # Collect dish IDs and fetch them from DB
    dish_ids = [item.get("dish_id") for item in items]
    if any(d_id is None for d_id in dish_ids):
        return jsonify({"error": "Each item must include dish_id"}), 400

    dishes = Dish.query.filter(Dish.id.in_(dish_ids)).all()
    dishes_by_id = {d.id: d for d in dishes}

    # Check all requested dishes exist
    missing = [d_id for d_id in dish_ids if d_id not in dishes_by_id]
    if missing:
        return jsonify({"error": f"Unknown dish_id(s): {missing}"}), 400

    # Calculate subtotal and enforce VIP-only rules
    subtotal = 0.0
    normalized_items = []
    vip_only_dish_ids = []

    for item in items:
        dish_id = item["dish_id"]
        quantity = int(item.get("quantity", 1))
        if quantity <= 0:
            return jsonify({"error": "quantity must be >= 1"}), 400

        dish = dishes_by_id[dish_id]

        # If dish is VIP-only and user is NOT VIP, block the order
        if dish.is_vip_only and user.role != "vip":
            vip_only_dish_ids.append(dish_id)
            continue

        subtotal += dish.price * quantity
        normalized_items.append((dish, quantity))

    if vip_only_dish_ids and user.role != "vip":
        return jsonify(
            {
                "error": "Non-VIP users cannot order VIP-only dishes.",
                "vip_only_dish_ids": vip_only_dish_ids,
                "user_role": user.role,
            }
        ), 403

    # ---------- 3) 5% discount for VIP customers ----------
    discount = 0.0
    if user.role == "vip":
        discount = round(subtotal * 0.05, 2)

    total = subtotal - discount
    # -----------------------------------------------------

    # Check balance + reckless warning logic
    if user.deposit_balance < total:
        user.warnings += 1

        message = (
            "Insufficient balance for this order; "
            "you have received a warning for reckless ordering."
        )

        # VIP demotion rule
        if user.role == "vip" and user.warnings >= 2:
            user.role = "customer"
            user.warnings = 0  # warnings cleared on demotion
            message += " You have been demoted from VIP to regular customer."

        # Registered customer kick-out rule
        elif user.role == "customer" and user.warnings >= 3:
            user.is_active = False
            user.is_blacklisted = True
            message += (
                " You have been deregistered and blacklisted after 3 warnings."
            )

        db.session.commit()

        return jsonify(
            {
                "error": "Insufficient balance",
                "message": message,
                "required": total,
                "current_balance": user.deposit_balance,
                "warnings": user.warnings,
                "role": user.role,
                "is_active": user.is_active,
                "is_blacklisted": user.is_blacklisted,
            }
        ), 400

    # Create order + order items
    order = Order(
        customer_id=user.id,
        status="paid",  # we'll assume instant payment for now
        total_price=total,
        discount_applied=discount,
    )
    db.session.add(order)
    db.session.flush()  # get order.id before creating items

    for dish, qty in normalized_items:
        item = OrderItem(
            order_id=order.id,
            dish_id=dish.id,
            quantity=qty,
            unit_price=dish.price,
        )
        db.session.add(item)

    # Update user stats
    user.deposit_balance -= total
    user.total_spent += total      # while still 'customer', total == subtotal
    user.order_count += 1

    # VIP promotion logic (spend > 100 or 3 orders, no outstanding complaints)
    just_promoted = maybe_update_vip_status(user)

    # Automatically create a delivery job for this paid order
    delivery_job = DeliveryJob(
        order_id=order.id,
        customer_id=user.id,
        delivery_address="160 Convent Avenue",  # TODO: tie to real address
        delivery_notes=None,
        status="open",
    )
    db.session.add(delivery_job)

    db.session.commit()

    return jsonify(
        {
            "message": "Order created",
            "order": {
                "id": order.id,
                "customer_id": order.customer_id,
                "status": order.status,
                "subtotal": subtotal,
                "discount": discount,   # 👈 front-end can show 5% here
                "total": total,
                "items": [
                    {
                        "dish_id": i.dish_id,
                        "quantity": i.quantity,
                        "unit_price": i.unit_price,
                    }
                    for i in order.items
                ],
            },
            "user_balance": user.deposit_balance,
            "vip_status": {
                "role": user.role,
                "just_promoted": just_promoted,
            },
        }
    ), 201


@order_bp.route("/user/<int:user_id>", methods=["GET"])
def list_orders_for_user(user_id):
    """Fetch all orders for a given user, including dish + chef info for rating."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    orders = (
        Order.query.filter_by(customer_id=user_id)
        .order_by(Order.created_at.desc())
        .all()
    )

    data = []
    for o in orders:
        items_data = []
        for item in o.items:
            dish = item.dish  # relationship from OrderItem -> Dish
            chef = dish.chef if dish else None

            items_data.append(
                {
                    "dish_id": item.dish_id,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    # Extra fields for UI & rating:
                    "dish_name": dish.name if dish else f"Dish {item.dish_id}",
                    "dish_image_url": dish.image_url if dish else None,
                    "chef_id": chef.id if chef else None,
                    "chef_name": chef.name if chef else None,
                }
            )

        data.append(
            {
                "id": o.id,
                "status": o.status,
                "total_price": o.total_price,
                "discount_applied": o.discount_applied,
                "created_at": o.created_at.isoformat(),
                "items": items_data,
            }
        )

    return jsonify({"orders": data})
