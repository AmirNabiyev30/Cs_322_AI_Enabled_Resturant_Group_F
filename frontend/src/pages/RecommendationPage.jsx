import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { getCurrentUser } from "../auth/user";

function RecommendationPage({ onAddToCart }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [maxPrice, setMaxPrice] = useState("");
  const [preference, setPreference] = useState("");
  const [maxResults, setMaxResults] = useState(5);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
  }, []);

  async function handleRecommend(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setRecommendations([]);

    if (!currentUser) {
      setError("You must be logged in to use recommendations.");
      return;
    }

    const payload = {
      user_id: currentUser.id,
      preference,
      max_results: Number(maxResults) || 5,
    };

    if (maxPrice !== "") {
      payload.max_price = parseFloat(maxPrice);
    }

    setLoading(true);
    try {
      const res = await api.post("/assistant/recommend", payload);
      setRecommendations(res.data.recommendations || []);
      setMessage(res.data.message || "");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to get recommendations. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleAddToCart(dish) {
    if (!onAddToCart) {
      setError("Cart is not available in this view.");
      return;
    }

    // central VIP logic is in App.addToCart, but we still call it:
    onAddToCart({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      is_vip_only: dish.is_vip_only,
      image_url: dish.image_url,
    });
  }

  if (!currentUser) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>Recommendation Assistant (Rule-based)</h2>
        <p>You must be logged in to see recommendations.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>
      <h2>Recommendation Assistant (Rule-based)</h2>
      <p style={{ maxWidth: "600px" }}>
        Get simple menu recommendations based on your budget and what you&apos;re
        in the mood for. This uses a rule-based algorithm (no LLM).
      </p>

      <form
        onSubmit={handleRecommend}
        style={{
          maxWidth: "420px",
          marginTop: "1rem",
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          border: "1px solid #ddd",
          backgroundColor: "#fafafa",
        }}
      >
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ fontWeight: 600 }}>Max price (optional):</label>
          <br />
          <input
            type="number"
            step="0.01"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            style={{ width: "100%", padding: "0.35rem" }}
            placeholder="e.g. 20"
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ fontWeight: 600 }}>What are you in the mood for?</label>
          <br />
          <input
            type="text"
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
            style={{ width: "100%", padding: "0.35rem" }}
            placeholder='e.g. "spicy fish", "vegan rice"'
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ fontWeight: 600 }}>How many suggestions?</label>
          <br />
          <input
            type="number"
            min="1"
            max="10"
            value={maxResults}
            onChange={(e) => setMaxResults(e.target.value)}
            style={{ width: "100%", padding: "0.35rem" }}
          />
        </div>

        {error && (
          <p style={{ color: "red", marginBottom: "0.75rem" }}>
            Error: {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Finding..." : "Get Recommendations"}
        </button>
      </form>

      {message && (
        <p style={{ marginTop: "1.5rem", fontWeight: "bold" }}>{message}</p>
      )}

      {recommendations.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Suggested Dishes</h3>
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: "700px" }}>
            {recommendations.map((dish) => {
              const isVipBlocked =
                dish.is_vip_only &&
                (!currentUser || currentUser.role !== "vip");

              return (
                <div
                  key={dish.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    padding: "0.75rem",
                    backgroundColor: "#fff",
                    display: "flex",
                    gap: "0.75rem",
                  }}
                >
                  {/* Image */}
                  {dish.image_url && (
                    <img
                      src={dish.image_url}
                      alt={dish.name}
                      style={{
                        width: "72px",
                        height: "72px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>{dish.name}</strong>{" "}
                        <span style={{ fontSize: "0.9rem" }}>
                          (
                          {dish.price !== undefined && dish.price !== null
                            ? `$${Number(dish.price).toFixed(2)}`
                            : "N/A"}
                          )
                        </span>
                        {dish.is_vip_only && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontSize: "0.8rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "999px",
                              backgroundColor: "#ffe08a",
                            }}
                          >
                            VIP ONLY
                          </span>
                        )}
                      </div>
                      {dish.score !== undefined && (
                        <span style={{ fontSize: "0.8rem", color: "#555" }}>
                          score: {dish.score}
                        </span>
                      )}
                    </div>

                    {dish.description && (
                      <p
                        style={{
                          marginTop: "0.25rem",
                          marginBottom: "0.5rem",
                        }}
                      >
                        {dish.description}
                      </p>
                    )}

                    <div style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleAddToCart(dish)}
                        disabled={isVipBlocked}
                        style={{
                          padding: "0.3rem 0.7rem",
                          borderRadius: "999px",
                          border: isVipBlocked
                            ? "1px solid #aaa"
                            : "1px solid #20c997",
                          backgroundColor: isVipBlocked
                            ? "#f1f3f5"
                            : "#e6fcf5",
                          color: isVipBlocked ? "#868e96" : "#087f5b",
                          fontSize: "0.8rem",
                          cursor: isVipBlocked ? "not-allowed" : "pointer",
                        }}
                      >
                        {isVipBlocked ? "VIP only" : "Add to cart"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default RecommendationPage;
