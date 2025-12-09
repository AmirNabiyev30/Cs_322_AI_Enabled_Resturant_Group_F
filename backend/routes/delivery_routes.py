from flask import Blueprint, request, jsonify
from extensions import db
from models import User, Order, DeliveryJob, DeliveryBid, Feedback

delivery_bp = Blueprint("delivery", __name__, url_prefix="/api/delivery")


def require_role(user, allowed_roles):
    if user.role not in allowed_roles:
        return False
    return True

def has_outstanding_complaints(user: User) -> bool:
    """
    'Outstanding complaints' against this user:
    - type='complaint'
    - status in ['pending', 'upheld']
    """
    return (
        Feedback.query.filter(
            Feedback.target_user_id == user.id,
            Feedback.type == "complaint",
            Feedback.status.in_(["pending", "upheld"]),
        ).count()
        > 0
    )


def recalculate_vip_status_and_rewards(user: User):
    """
    Implements:
    - Registered customers become VIP after:
        * spending > $100  OR
        * making >= 3 orders as registered customers
      AND having no outstanding complaints.
    - VIPs get 1 free delivery credit for every 3 delivered orders.
    """

    if not user.is_active or user.is_blacklisted:
        return

    # If already VIP, just advance the "orders since last free" counter.
    if user.role == "vip":
        user.vip_orders_since_last_free = (user.vip_orders_since_last_free or 0) + 1
        if user.vip_orders_since_last_free >= 3:
            user.vip_orders_since_last_free = 0
            user.vip_free_delivery_credits = (user.vip_free_delivery_credits or 0) + 1
        return

    # Only normal registered customers can be promoted
    if user.role != "customer":
        return

    # Must have no outstanding complaints *against* them
    if has_outstanding_complaints(user):
        return

    spent = user.total_spent or 0.0
    orders = user.order_count or 0

    # Promotion condition
    if spent > 100 or orders >= 3:
        user.role = "vip"
        # Start VIP reward cycle from 0
        user.vip_orders_since_last_free = 0
        user.vip_free_delivery_credits = user.vip_free_delivery_credits or 0



@delivery_bp.route("/create-job", methods=["POST"])
def create_delivery_job():
    """
    Create a delivery job for an order.
    Typically used by staff/manager when an order is confirmed & needs delivery.

    Body:
    {
      "order_id": 1,
      "customer_id": 5,
      "delivery_address": "123 Main St, NYC",
      "delivery_notes": "Ring the bell twice"
    }
    """

    data = request.get_json() or {}
    order_id = data.get("order_id")
    customer_id = data.get("customer_id")
    delivery_address = (data.get("delivery_address") or "").strip()
    delivery_notes = (data.get("delivery_notes") or "").strip()

    if not order_id or not customer_id or not delivery_address:
        return jsonify({"error": "order_id, customer_id and delivery_address are required"}), 400

    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    customer = User.query.get(customer_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404

    # Optionally: only staff or manager can create jobs
    # (assume you pass staff user_id if you want to enforce)
    # For now we skip that check or you can add it later.

    job = DeliveryJob(
        order_id=order_id,
        customer_id=customer_id,
        delivery_address=delivery_address,
        delivery_notes=delivery_notes or None,
        status="open",
    )
    db.session.add(job)
    db.session.commit()

    return jsonify(
        {
            "id": job.id,
            "order_id": job.order_id,
            "customer_id": job.customer_id,
            "delivery_address": job.delivery_address,
            "delivery_notes": job.delivery_notes,
            "status": job.status,
        }
    ), 201


@delivery_bp.route("/open-jobs", methods=["GET"])
def list_open_jobs():
    """
    List all delivery jobs that are open/bidding and not assigned yet.
    For delivery people to see what they can accept.
    """

    jobs = (
        DeliveryJob.query.filter(
            DeliveryJob.status.in_(["open", "bidding"]),
            DeliveryJob.courier_id.is_(None),
        )
        .order_by(DeliveryJob.created_at.asc())
        .all()
    )

    result = []
    for job in jobs:
        # Use order total to compute a reasonable fee
        order = job.order  # relies on DeliveryJob.order relationship
        if order and order.total_price is not None:
            # e.g. 10% of order total, min $3, max $15
            suggested_fee = max(3.0, min(15.0, float(order.total_price) * 0.1))
        else:
            suggested_fee = 5.0

        result.append(
            {
                "id": job.id,
                "order_id": job.order_id,
                "delivery_address": job.delivery_address,
                "delivery_notes": job.delivery_notes,
                "status": job.status,
                "suggested_fee": suggested_fee,
                "estimated_minutes": 30,  # simple fixed ETA for now
            }
        )

    return jsonify(result), 200


@delivery_bp.route("/accept-job", methods=["POST"])
def accept_job_simple():
    """
    A courier accepts an open job directly (no bidding).
    Body:
    {
      "user_id": 10,
      "delivery_job_id": 3,
      "fee": 6.50,          # optional, overrides suggested fee
      "eta_minutes": 25     # optional, for display/logging
    }
    """

    data = request.get_json() or {}
    user_id = data.get("user_id")
    job_id = data.get("delivery_job_id")
    fee = data.get("fee")
    eta_minutes = data.get("eta_minutes")

    if not user_id or not job_id:
        return jsonify({"error": "user_id and delivery_job_id are required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Only couriers/delivery staff can accept jobs
    if not require_role(user, ["courier", "delivery"]):
        return jsonify({"error": "Only couriers can accept jobs"}), 403

    job = DeliveryJob.query.get(job_id)
    if not job:
        return jsonify({"error": "Delivery job not found"}), 404

    if job.courier_id is not None or job.status not in ["open", "bidding"]:
        return jsonify({"error": "This job is not available for acceptance"}), 400

    # Compute a default fee if not provided
    order = job.order
    if fee is not None:
        try:
            agreed_fee = float(fee)
        except ValueError:
            return jsonify({"error": "fee must be a number"}), 400
    else:
        if order and order.total_price is not None:
            agreed_fee = max(3.0, min(15.0, float(order.total_price) * 0.1))
        else:
            agreed_fee = 5.0

    job.courier_id = user.id
    job.agreed_fee = agreed_fee
    job.status = "assigned"

    # Optionally log ETA into notes for now
    if eta_minutes is not None:
        try:
            eta_int = int(eta_minutes)
        except ValueError:
            eta_int = None
        if eta_int is not None:
            note_suffix = f" [ETA ~{eta_int} minutes by courier {user.name}]"
            if job.delivery_notes:
                job.delivery_notes = job.delivery_notes + note_suffix
            else:
                job.delivery_notes = note_suffix

    db.session.commit()

    return jsonify(
        {
            "delivery_job_id": job.id,
            "order_id": job.order_id,
            "courier_id": job.courier_id,
            "courier_name": user.name,
            "agreed_fee": job.agreed_fee,
            "status": job.status,
            "delivery_address": job.delivery_address,
            "delivery_notes": job.delivery_notes,
        }
    ), 200



@delivery_bp.route("/my-jobs/<int:user_id>", methods=["GET"])
def list_jobs_for_courier(user_id):
    """
    List all delivery jobs assigned to a given courier.
    For couriers to see the jobs they have accepted.
    """

    courier = User.query.get(user_id)
    if not courier:
        return jsonify({"error": "Courier not found"}), 404

    if not require_role(courier, ["courier", "delivery"]):
        return jsonify({"error": "Only couriers can view their jobs"}), 403

    jobs = (
        DeliveryJob.query
        .filter(DeliveryJob.courier_id == user_id)
        .order_by(DeliveryJob.created_at.desc())
        .all()
    )

    result = []
    for job in jobs:
        order = job.order
        if order and order.total_price is not None:
            suggested_fee = max(3.0, min(15.0, float(order.total_price) * 0.1))
        else:
            suggested_fee = job.agreed_fee or 5.0

        result.append(
            {
                "id": job.id,
                "order_id": job.order_id,
                "delivery_address": job.delivery_address,
                "delivery_notes": job.delivery_notes,
                "status": job.status,
                "agreed_fee": job.agreed_fee,
                "suggested_fee": suggested_fee,
                "created_at": job.created_at.isoformat() if job.created_at else None,
            }
        )

    return jsonify(result), 200




@delivery_bp.route("/bid", methods=["POST"])
def place_bid():
    """
    A courier places a bid on an open job.

    Body:
    {
      "user_id": 10,
      "delivery_job_id": 3,
      "bid_amount": 8.50,
      "eta_minutes": 25
    }
    """

    data = request.get_json() or {}
    user_id = data.get("user_id")
    job_id = data.get("delivery_job_id")
    bid_amount = data.get("bid_amount")
    eta_minutes = data.get("eta_minutes")

    if not user_id or not job_id or bid_amount is None:
        return jsonify({"error": "user_id, delivery_job_id and bid_amount are required"}), 400

    courier = User.query.get(user_id)
    if not courier:
        return jsonify({"error": "Courier user not found"}), 404

    if not require_role(courier, ["courier", "delivery"]):
        return jsonify({"error": "Only delivery/courier users can place bids"}), 403

    job = DeliveryJob.query.get(job_id)
    if not job:
        return jsonify({"error": "Delivery job not found"}), 404

    if job.status not in ["open", "bidding"] or job.courier_id is not None:
        return jsonify({"error": "This job is not open for bidding"}), 400

    # Optional: prevent duplicate bids from same courier
    existing = DeliveryBid.query.filter_by(
        delivery_job_id=job_id, courier_id=user_id
    ).first()
    if existing:
        return jsonify({"error": "You already placed a bid on this job"}), 400

    bid = DeliveryBid(
        delivery_job_id=job_id,
        courier_id=user_id,
        bid_amount=float(bid_amount),
        eta_minutes=int(eta_minutes) if eta_minutes is not None else None,
        status="pending",
    )

    job.status = "bidding"

    db.session.add(bid)
    db.session.commit()

    return jsonify(
        {
            "id": bid.id,
            "delivery_job_id": bid.delivery_job_id,
            "courier_id": bid.courier_id,
            "bid_amount": bid.bid_amount,
            "eta_minutes": bid.eta_minutes,
            "status": bid.status,
        }
    ), 201


@delivery_bp.route("/job/<int:job_id>/bids", methods=["GET"])
def list_bids_for_job(job_id):
    """
    List all bids for a given delivery job.
    For restaurant staff/manager to review and choose one.
    """

    job = DeliveryJob.query.get(job_id)
    if not job:
        return jsonify({"error": "Delivery job not found"}), 404

    bids = DeliveryBid.query.filter_by(delivery_job_id=job_id).order_by(
        DeliveryBid.bid_amount.asc()
    ).all()

    result = []
    for b in bids:
        result.append(
            {
                "id": b.id,
                "courier_id": b.courier_id,
                "courier_name": b.courier.name if hasattr(b.courier, "name") else None,
                "bid_amount": b.bid_amount,
                "eta_minutes": b.eta_minutes,
                "status": b.status,
            }
        )

    return jsonify(
        {
            "delivery_job_id": job.id,
            "order_id": job.order_id,
            "status": job.status,
            "bids": result,
        }
    ), 200


@delivery_bp.route("/accept-bid", methods=["POST"])
def accept_bid():
    """
    Accept a specific bid for a delivery job.
    Typically done by staff/manager.

    Body:
    {
      "staff_user_id": 2,
      "bid_id": 7
    }
    """

    data = request.get_json() or {}
    staff_user_id = data.get("staff_user_id")
    bid_id = data.get("bid_id")

    if not staff_user_id or not bid_id:
        return jsonify({"error": "staff_user_id and bid_id are required"}), 400

    staff = User.query.get(staff_user_id)
    if not staff:
        return jsonify({"error": "Staff user not found"}), 404

    # Enforce only staff/manager can accept bids
    if not require_role(staff, ["staff", "manager", "admin"]):
        return jsonify({"error": "Only staff/manager can accept bids"}), 403

    bid = DeliveryBid.query.get(bid_id)
    if not bid:
        return jsonify({"error": "Bid not found"}), 404

    job = bid.delivery_job
    if not job:
        return jsonify({"error": "Delivery job not found for this bid"}), 404

    if job.courier_id is not None or job.status not in ["open", "bidding"]:
        return jsonify({"error": "This job is not open for accepting bids"}), 400

    # Accept this bid, reject others
    all_bids = DeliveryBid.query.filter_by(delivery_job_id=job.id).all()
    for b in all_bids:
        if b.id == bid.id:
            b.status = "accepted"
        else:
            b.status = "rejected"

    job.courier_id = bid.courier_id
    job.agreed_fee = bid.bid_amount
    job.status = "assigned"

    db.session.commit()

    return jsonify(
        {
            "delivery_job_id": job.id,
            "order_id": job.order_id,
            "courier_id": job.courier_id,
            "agreed_fee": job.agreed_fee,
            "status": job.status,
        }
    ), 200


@delivery_bp.route("/update-status", methods=["POST"])
def update_delivery_status():
    """
    Update the status of a delivery job.
    E.g., courier marking picked_up or delivered.

    Body:
    {
      "user_id": 10,
      "delivery_job_id": 3,
      "status": "picked_up"  # or "delivered", "cancelled"
    }
    """

    data = request.get_json() or {}
    user_id = data.get("user_id")
    job_id = data.get("delivery_job_id")
    new_status = (data.get("status") or "").strip()

    if not user_id or not job_id or not new_status:
        return jsonify({"error": "user_id, delivery_job_id and status are required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    job = DeliveryJob.query.get(job_id)
    if not job:
        return jsonify({"error": "Delivery job not found"}), 404

    # Simple rules:
    # - courier assigned to the job can set picked_up/delivered
    # - staff/manager can cancel
    allowed_statuses = ["picked_up", "delivered", "cancelled"]
    if new_status not in allowed_statuses:
        return jsonify({"error": f"Invalid status. Allowed: {allowed_statuses}"}), 400

    if new_status in ["picked_up", "delivered"]:
        if job.courier_id != user.id:
            return jsonify({"error": "Only the assigned courier can update this status"}), 403

    if new_status == "cancelled":
        if not require_role(user, ["staff", "manager", "admin"]):
            return jsonify({"error": "Only staff/manager can cancel delivery jobs"}), 403

    # --- update the delivery job ---
    job.status = new_status

    # --- when delivered: also update the underlying order + loyalty/VIP ---
    if new_status == "delivered" and job.order is not None:
        order = job.order
        order.status = "delivered"

        customer = order.customer
        if customer is not None:
            # Update total spent and order count
            amount = order.total_price or 0.0
            customer.total_spent = (customer.total_spent or 0.0) + amount
            customer.order_count = (customer.order_count or 0) + 1

            # Apply VIP promotion + free-delivery rewards
            recalculate_vip_status_and_rewards(customer)

    db.session.commit()

    return jsonify(
        {
            "delivery_job_id": job.id,
            "status": job.status,
            "order_status": job.order.status if job.order else None,
        }
    ), 200

