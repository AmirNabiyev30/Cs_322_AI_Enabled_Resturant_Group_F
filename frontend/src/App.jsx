import { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";

import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import MenuPage from "./pages/MenuPage.jsx";
import DepositPage from "./pages/DepositPage.jsx";
import MyOrdersPage from "./pages/MyOrdersPage.jsx";
import CartPage from "./pages/CartPage.jsx";
import RecommendationPage from "./pages/RecommendationPage.jsx";
import ChatbotPage from "./pages/ChatbotPage.jsx";
import DeliveryJobsPage from "./pages/DeliveryJobsPage.jsx";
import ReputationManagementPage from "./pages/ReputationManagementPage.jsx";
import ManagerPage from "./pages/ManagerPage.jsx";
import FeedbackPage from "./pages/FeedbackPage.jsx";
import DiscussionPage from "./pages/DiscussionPage.jsx";

import { getCurrentUser, logoutUser } from "./auth/user";

function App() {
  const [currentUser, setCurrentUser] = useState(null);

  // Cart items: [{ dish_id, name, price, quantity, is_vip_only }]
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
  }, []);

  function handleLogout() {
    logoutUser();
    setCurrentUser(null);
    alert("Logged out.");
  }

  // Small reusable VIP pill (navbar)
  const VipPill = () => (
    <span
      style={{
        marginLeft: "0.5rem",
        padding: "0.15rem 0.6rem",
        borderRadius: "999px",
        backgroundColor: "#fff3bf",
        color: "#856404",
        fontSize: "0.75rem",
        fontWeight: 600,
        border: "1px solid #ffe066",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
      }}
    >
      <span>⭐ VIP</span>
    </span>
  );

  function addToCart(dish) {
    // 1) VIP guard: non-VIPs cannot add VIP-only dishes
    if (dish.is_vip_only && (!currentUser || currentUser.role !== "vip")) {
      alert("This dish is VIP-only. You must be a VIP customer to order it.");
      return;
    }

    const imageUrl = dish.image_url || dish.imageUrl || null;

    setCartItems((prev) => {
      const existing = prev.find((item) => item.dish_id === dish.id);
      if (existing) {
        return prev.map((item) =>
          item.dish_id === dish.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          dish_id: dish.id,
          name: dish.name,
          price: dish.price,
          quantity: 1,
          is_vip_only: dish.is_vip_only,
          image_url: imageUrl,
        },
      ];
    });
  }

  function removeFromCart(dishId) {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.dish_id === dishId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function clearCart() {
    setCartItems([]);
  }

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div>
      {/* Navbar */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "1rem",
          backgroundColor: "#f5f5f5",
          marginBottom: "1rem",
        }}
      >
        <div>
          <Link to="/" style={{ marginRight: "1rem" }}>
            Home
          </Link>
          <Link to="/menu" style={{ marginRight: "1rem" }}>
            Menu
          </Link>
          <Link to="/cart" style={{ marginRight: "1rem" }}>
            Cart ({cartCount})
          </Link>
          <Link to="/recommendation" style={{ marginRight: "1rem" }}>
            Recommendation
          </Link>
          <Link to="/chatbot" style={{ marginRight: "1rem" }}>
            AI Chatbot
          </Link>
          <Link to="/my-orders" style={{ marginRight: "1rem" }}>
            My Orders
          </Link>
          <Link to="/deposit" style={{ marginRight: "1rem" }}>
            Deposit
          </Link>
          <Link to="/manager" style={{ marginRight: "1rem" }}>
            Manager
          </Link>
          <Link to="/delivery-jobs" style={{ marginRight: "1rem" }}>
            Delivery Jobs
          </Link>
          <Link to="/reputation-management" style={{ marginRight: "1rem" }}>
            HR & Reputation
          </Link>
          <Link to="/feedback" style={{ marginRight: "1rem" }}>
            File Feedback
          </Link>
          <Link to="/discussion" style={{ marginRight: "1rem" }}>
            Discussion
          </Link>
        </div>

        <div>
          {currentUser ? (
            <>
              <span style={{ marginRight: "0.75rem" }}>
                Logged in as <strong>{currentUser.name}</strong>{" "}
                <span style={{ fontSize: "0.85rem" }}>
                  ({currentUser.role})
                </span>
                {/* Global VIP badge in navbar */}
                {currentUser.role === "vip" && <VipPill />}
                {/* Warnings badge for customers/VIPs */}
                {typeof currentUser.warnings === "number" &&
                  currentUser.warnings > 0 &&
                  (currentUser.role === "customer" ||
                    currentUser.role === "vip") && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        backgroundColor: "#fff3bf",
                        color: "#d9480f",
                        border: "1px solid #fcc419",
                      }}
                    >
                      Warnings: {currentUser.warnings}
                    </span>
                  )}
              </span>
              <button onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ marginRight: "1rem" }}>
                Login
              </Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </div>
      </nav>

      {/* Routes */}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/menu"
          element={<MenuPage onAddToCart={addToCart} />}
        />
        <Route
          path="/cart"
          element={
            <CartPage
              cartItems={cartItems}
              removeFromCart={removeFromCart}
              clearCart={clearCart}
              addToCart={addToCart}   // <-- REQUIRED
            />
          }
        />

        <Route
          path="/recommendation"
          element={<RecommendationPage onAddToCart={addToCart} />}
        />
        <Route
          path="/chatbot"
          element={<ChatbotPage onAddToCart={addToCart} />}
        />
        <Route path="/my-orders" element={<MyOrdersPage />} />
        <Route path="/deposit" element={<DepositPage />} />
        <Route
          path="/login"
          element={<LoginPage onLogin={setCurrentUser} />}
        />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/delivery-jobs" element={<DeliveryJobsPage />} />
      
        <Route
          path="/reputation-management"
          element={<ReputationManagementPage />}
        />
        <Route path="/manager" element={<ManagerPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/discussion" element={<DiscussionPage />} />
      </Routes>
    </div>
  );
}

export default App;
