# backend/seed_data.py

from app import create_app
from extensions import db
from models import User, Dish

app = create_app()

with app.app_context():
    print("Dropping and recreating all tables...")
    db.drop_all()
    db.create_all()

    # 1) MANAGER
    manager = User(
        name="Manager Mike",
        email="manager@example.com",
        role="manager",
        pay_rate=0.0,
        is_employed=True,
        is_active=True,
    )
    manager.set_password("manager123")

    # 2) CHEFS (at least two)
    chef1 = User(
        name="Chef Marco",
        email="chef1@example.com",
        role="chef",
        pay_rate=25.0,
        is_employed=True,
        is_active=True,
    )
    chef1.set_password("chef123")

    chef2 = User(
        name="Chef Aiko",
        email="chef2@example.com",
        role="chef",
        pay_rate=24.0,
        is_employed=True,
        is_active=True,
    )
    chef2.set_password("chef123")

    # 3) DELIVERY PEOPLE (at least two)
    courier1 = User(
        name="Courier Sam",
        email="courier1@example.com",
        role="courier",
        pay_rate=18.0,
        is_employed=True,
        is_active=True,
    )
    courier1.set_password("courier123")

    courier2 = User(
        name="Courier Lina",
        email="courier2@example.com",
        role="courier",
        pay_rate=18.5,
        is_employed=True,
        is_active=True,
    )
    courier2.set_password("courier123")

    # 4) CUSTOMERS
    customer1 = User(
        name="Alice Customer",
        email="1@email.com",
        role="customer",
        deposit_balance=200.0,
        is_active=True,
    )
    customer1.set_password("test123")

    customer2 = User(
        name="Bob Customer",
        email="2@email.com",
        role="customer",
        deposit_balance=150.0,
        is_active=True,
    )
    customer2.set_password("test123")

    db.session.add_all(
        [manager, chef1, chef2, courier1, courier2, customer1, customer2]
    )
    db.session.flush()  # make sure IDs assigned

    # 5) DISHES tied to chefs
    dishes = [
        Dish(
            name="Spicy Ramen",
            description="Rich broth with chili oil, soft-boiled egg, and pork.",
            price=14.99,
            image_url="/dishes/spicy-ramen.jpg",
            is_vip_only=False,
            chef_id=chef1.id,
        ),
        Dish(
            name="Vegan Buddha Bowl",
            description="Quinoa, roasted veggies, hummus, tahini dressing.",
            price=12.50,
            image_url="/dishes/ratatouille.jpg",
            is_vip_only=False,
            chef_id=chef2.id,
        ),
        Dish(
            name="Truffle Steak",
            description="Grilled steak with truffle butter and fries.",
            price=32.00,
            image_url="/dishes/truffle-steak.jpg",
            is_vip_only=True,
            chef_id=chef1.id,
        ),
        Dish(
            name="Spicy Shrimp Tacos",
            description="Shrimp with spicy mayo, slaw, and lime.",
            price=16.00,
            image_url="/dishes/spicy-tacos.jpg",
            is_vip_only=False,
            chef_id=chef2.id,
        ),
    ]

    db.session.add_all(dishes)
    db.session.commit()

    print("✅ Seed data inserted successfully!")
    print("Logins:")
    print("  Manager  : manager@example.com / manager123")
    print("  Chef 1   : chef1@example.com / chef123")
    print("  Chef 2   : chef2@example.com / chef123")
    print("  Courier1 : courier1@example.com / courier123")
    print("  Courier2 : courier2@example.com / courier123")
    print("  Customer1: 1@email.com / test123")
    print("  Customer2: 2@email.com / test123")
