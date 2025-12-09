import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()

from extensions import db  # <-- shared db instance


def create_app():
    app = Flask(__name__)

    # Configure SQLite database
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(BASE_DIR, "restaurant.db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = "change_me_later"

    # Allow React frontend to access this backend
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize SQLAlchemy with this app
    db.init_app(app)

    # Import models and create tables
    with app.app_context():
        from models import User, Dish, Order, OrderItem
        db.create_all()

    # Register route blueprints
    from routes.auth_routes import auth_bp
    from routes.menu_routes import menu_bp
    from routes.order_routes import order_bp
    from routes.wallet_routes import wallet_bp
    from routes.admin_routes import admin_bp
    from routes.assistant_routes import assistant_bp
    from routes.delivery_routes import delivery_bp
    from routes.reputation_routes import reputation_bp
    from routes.knowledge_routes import knowledge_bp
    from routes.manager_routes import manager_bp
    from routes.discussion_routes import discussion_bp





    app.register_blueprint(auth_bp)
    app.register_blueprint(menu_bp)
    app.register_blueprint(order_bp)
    app.register_blueprint(wallet_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(assistant_bp)
    app.register_blueprint(delivery_bp)
    app.register_blueprint(reputation_bp)
    app.register_blueprint(knowledge_bp)
    app.register_blueprint(manager_bp)
    app.register_blueprint(discussion_bp)






    # Health route
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=True)
