from flask import Blueprint, request, jsonify
from extensions import db
from models import User

manager_bp = Blueprint("manager", __name__, url_prefix="/api/manager")


def is_manager(user: User) -> bool:
    return user.role in ["manager", "admin"]


@manager_bp.route("/employees", methods=["GET"])
def list_employees():
    """
    Manager view of chefs & delivery people.
    """
    employees = User.query.filter(
        User.role.in_(["chef", "junior_chef", "courier", "delivery"])
    ).all()

    data = []
    for u in employees:
        data.append(
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "pay_rate": float(u.pay_rate or 0.0),
                "is_employed": bool(u.is_employed),
                "is_active": bool(u.is_active),
                "warnings": u.warnings,
            }
        )

    return jsonify({"employees": data})


@manager_bp.route("/customers", methods=["GET"])
def list_customers():
    """
    Manager view of all customers (including VIPs) to process registrations / issues.
    """
    # 🚨 Previously: User.role == "customer"
    # Now include VIPs too
    customers = User.query.filter(
        User.role.in_(["customer", "vip"])
    ).all()

    data = []
    for c in customers:
        data.append(
            {
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "is_active": bool(c.is_active),
                "is_blacklisted": bool(c.is_blacklisted),
                "warnings": c.warnings,
                "total_spent": float(c.total_spent or 0.0),
                "order_count": c.order_count,
                # optional extra fields if you want them later in the UI
                "role": c.role,                    # "customer" or "vip"
                "is_vip": (c.role == "vip"),
            }
        )

    return jsonify({"customers": data})



@manager_bp.route("/update-employee", methods=["POST"])
def update_employee():
    """
    Hire/fire/raise/cut pay, change role for chefs & delivery people.

    Body:
    {
      "manager_id": 2,
      "user_id": 7,
      "role": "chef" | "courier" | "delivery" | "junior_chef",   # optional
      "pay_rate": 25.0,                                          # optional
      "is_employed": true / false                                # optional
    }
    """
    data = request.get_json() or {}

    manager_id = data.get("manager_id")
    user_id = data.get("user_id")
    new_role = data.get("role")
    new_pay = data.get("pay_rate")
    new_employed = data.get("is_employed")

    if not manager_id or not user_id:
        return jsonify({"error": "manager_id and user_id are required"}), 400

    manager = User.query.get(manager_id)
    if not manager:
        return jsonify({"error": "Manager user not found"}), 404

    if not is_manager(manager):
        return jsonify({"error": "Only manager/admin can update employees"}), 403

    employee = User.query.get(user_id)
    if not employee:
        return jsonify({"error": "Employee not found"}), 404

    # Change role (hire/promote/demote)
    if new_role:
        employee.role = new_role

    # Raise / cut pay
    if new_pay is not None:
        try:
            employee.pay_rate = float(new_pay)
        except ValueError:
            return jsonify({"error": "pay_rate must be a number"}), 400

    # Fire / rehire
    if new_employed is not None:
        employed_flag = bool(new_employed)
        employee.is_employed = employed_flag
        # if fired, deactivate their login
        if not employed_flag:
            employee.is_active = False

    db.session.commit()

    return jsonify(
        {
            "message": "Employee updated",
            "employee": {
                "id": employee.id,
                "name": employee.name,
                "role": employee.role,
                "pay_rate": employee.pay_rate,
                "is_employed": employee.is_employed,
                "is_active": employee.is_active,
            },
        }
    ), 200


@manager_bp.route("/update-customer-status", methods=["POST"])
def update_customer_status():
    """
    Manager handles registrations / issues for customers.

    Body:
    {
      "manager_id": 2,
      "customer_id": 5,
      "action": "activate" | "deactivate" | "blacklist" | "unblacklist"
    }
    """
    data = request.get_json() or {}

    manager_id = data.get("manager_id")
    customer_id = data.get("customer_id")
    action = (data.get("action") or "").strip()

    if not manager_id or not customer_id or not action:
        return jsonify(
            {"error": "manager_id, customer_id and action are required"}
        ), 400

    manager = User.query.get(manager_id)
    if not manager:
        return jsonify({"error": "Manager user not found"}), 404

    if not is_manager(manager):
        return jsonify({"error": "Only manager/admin can manage customers"}), 403

    customer = User.query.get(customer_id)
    if not customer:
        return jsonify({"error": "Customer not found"}), 404

    if action == "activate":
        customer.is_active = True
        customer.is_blacklisted = False
        msg = "Customer activated."
    elif action == "deactivate":
        customer.is_active = False
        msg = "Customer deactivated."
    elif action == "blacklist":
        customer.is_blacklisted = True
        customer.is_active = False
        msg = "Customer blacklisted."
    elif action == "unblacklist":
        customer.is_blacklisted = False
        # you may or may not automatically re-activate
        customer.is_active = True
        msg = "Customer removed from blacklist and activated."
    else:
        return jsonify(
            {
                "error": "Invalid action. Use activate, deactivate, blacklist, or unblacklist."
            }
        ), 400

    db.session.commit()

    return jsonify({"message": msg}), 200
