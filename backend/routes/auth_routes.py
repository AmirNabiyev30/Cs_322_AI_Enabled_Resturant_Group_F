from flask import Blueprint, request, jsonify
from extensions import db
from models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}

    name = data.get("name", "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"error": "Name, email, password required"}), 400

    existing = User.query.filter_by(email=email).first()
    if existing:
        return jsonify({"error": "Email already registered"}), 400

    user = User(name=name, email=email)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify(
        {
            "message": "Registered",
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "warnings": user.warnings or 0,
                "is_blacklisted": user.is_blacklisted,
                "is_active": user.is_active,
            },
        }
    ), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()

    # 🔍 Separate the two cases so we can tell what's wrong during debug
    if not user:
        return jsonify({"error": "Invalid credentials (no such email)"}), 401

    if not user.check_password(password):
        return jsonify({"error": "Invalid credentials (wrong password)"}), 401

    if not user.is_active or user.is_blacklisted:
        return jsonify({"error": "Your account is not active."}), 403

    return jsonify(
        {
            "user": {  # 👈 Wrap in "user" so your React code works
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "warnings": user.warnings or 0,
                "is_blacklisted": user.is_blacklisted,
                "is_active": user.is_active,
            }
        }
    ), 200
