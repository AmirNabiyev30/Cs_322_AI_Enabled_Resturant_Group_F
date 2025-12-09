import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { getCurrentUser } from "../auth/user";

function ChatbotPage({ onAddToCart }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! I’m the AI assistant for this restaurant system. Ask me about the menu, orders, deliveries, or let me suggest an order for you.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false); // for /assistant/chat
  const [suggestLoading, setSuggestLoading] = useState(false); // for suggest-order
  const [error, setError] = useState("");
  const [lastSuggestedItems, setLastSuggestedItems] = useState([]);
  const [pendingKbRating, setPendingKbRating] = useState(null); // { knowledgeId }
  const chatEndRef = useRef(null);

  // Load current user
  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  // SINGLE version of sendChatMessage (KB-aware)
  async function sendChatMessage(userMessage) {
    if (!currentUser) {
      setError("You must be logged in to chat with the AI.");
      return;
    }

    setError("");

    const trimmed = userMessage.trim();
    if (!trimmed) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: trimmed,
        timestamp: new Date().toISOString(),
      },
    ]);

    setLoading(true);

    try {
      const res = await api.post("/assistant/chat", {
        user_id: currentUser.id,
        message: trimmed,
      });

      const answer = res.data.answer || "(No response from AI)";
      const itemsFromAI = res.data.items || [];
      const source = res.data.source || "llm";
      const knowledgeId = res.data.knowledge_id || null;

      if (itemsFromAI.length > 0) {
        setLastSuggestedItems(itemsFromAI);
      } else {
        setLastSuggestedItems([]);
      }

      // If came from KB, enable rating UI
      if (source === "kb" && knowledgeId) {
        setPendingKbRating({ knowledgeId });
      } else {
        setPendingKbRating(null);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: answer,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to contact AI chatbot.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim()) return;

    const msg = input;
    setInput("");
    await sendChatMessage(msg);
  }

  async function handleQuickAsk(text) {
    if (loading || suggestLoading) return;
    await sendChatMessage(text);
  }

  async function handleSuggestOrder(e) {
    if (e) e.preventDefault();
    setError("");

    if (!currentUser) {
      setError("You must be logged in to use suggestions.");
      return;
    }

    setSuggestLoading(true);

    try {
      const res = await api.post("/assistant/suggest-order", {
        user_id: currentUser.id,
        max_price: 30.0,
        max_items: 3,
      });

      const suggestionText =
        res.data.message ||
        "Here is a suggested order, but I couldn’t format the details.";

      const items = res.data.items || [];
      setLastSuggestedItems(items);

      // Show suggestion as an AI message
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: suggestionText,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to get a suggested order.");
      }
    } finally {
      setSuggestLoading(false);
    }
  }

  function handleAddSuggestedToCart() {
    setError("");

    if (!onAddToCart) {
      setError("Cart is not available in this view.");
      return;
    }

    if (!lastSuggestedItems || lastSuggestedItems.length === 0) {
      setError("No suggested order available. Ask for a suggestion first.");
      return;
    }

    const blockedNames = [];

    lastSuggestedItems.forEach((item) => {
      const isVipBlocked =
        item.is_vip_only && (!currentUser || currentUser.role !== "vip");

      if (isVipBlocked) {
        blockedNames.push(item.name);
        return;
      }

      const quantity = item.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        onAddToCart({
          id: item.id,
          name: item.name,
          price: item.price,
          is_vip_only: item.is_vip_only,
          image_url: item.image_url || null,
        });
      }
    });

    let baseText =
      "I’ve added the suggested order to your cart. You can review or change it on the Cart page.";

    if (blockedNames.length > 0) {
      baseText +=
        "\n\nNote: The following items are VIP-only and were not added because you are not a VIP customer:\n- " +
        blockedNames.join("\n- ");
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: baseText,
        timestamp: new Date().toISOString(),
      },
    ]);
  }

  async function handleRateKb(score) {
    if (!pendingKbRating || !currentUser) return;

    try {
      const res = await api.post("/knowledge/rate", {
        user_id: currentUser.id,
        knowledge_id: pendingKbRating.knowledgeId,
        score,
      });

      const msg = res.data.message || "Rating recorded.";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `KB rating submitted: ${msg}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error(err);
      setError("Failed to submit rating for KB answer.");
    } finally {
      setPendingKbRating(null);
    }
  }

  if (!currentUser) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>AI Chatbot</h2>
        <p>You must be logged in to use the AI chatbot.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  const isAITyping = loading; // you can also include suggestLoading if you want

  return (
    <div
      style={{
        padding: "1.5rem",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "960px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: "480px",
          maxHeight: "80vh",
          backgroundColor: "#f8f9fa",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #ddd",
            background:
              "linear-gradient(90deg, rgba(0,123,255,0.9), rgba(32,201,151,0.9))",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: "600" }}>
              Restaurant AI Assistant
            </div>
            <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
              Logged in as: {currentUser.name} ({currentUser.role})
            </div>
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              textAlign: "right",
              maxWidth: "260px",
              lineHeight: "1.3",
            }}
          >
            Powered by local LLM (Ollama) — helps with menu, ordering, and
            delivery bidding.
          </div>
        </div>

        {/* Info bar */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #eee",
            fontSize: "0.9rem",
            backgroundColor: "#ffffff",
          }}
        >
          <p style={{ margin: 0, lineHeight: "1.45" }}>
            <strong>What can I ask?</strong> <br />
            – Menu & ordering:{" "}
            <em>“What spicy dishes are under $20?”</em>
            <br />
            – Suggested order: use{" "}
            <strong>Suggest an order</strong> and{" "}
            <strong>Add suggested order to cart</strong>. <br />
            – Delivery & bidding:{" "}
            <em>“Show me open delivery jobs”</em>,{" "}
            <em>“Which job has the lowest bid?”</em>.
          </p>
        </div>

        {/* Chat area */}
        <div
          style={{
            flex: 1,
            padding: "0.75rem 1rem",
            overflowY: "auto",
            backgroundColor: "#f1f3f5",
          }}
        >
          {error && (
            <p style={{ color: "red", marginBottom: "0.75rem" }}>
              Error: {error}
            </p>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  marginBottom: "0.6rem",
                  justifyContent: isUser ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "14px",
                    backgroundColor: isUser ? "#0d6efd" : "#e9ecef",
                    color: isUser ? "#fff" : "#212529",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        opacity: 0.9,
                      }}
                    >
                      {isUser ? "You" : "AI"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        opacity: 0.75,
                        marginLeft: "0.5rem",
                      }}
                    >
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.9rem" }}>{msg.text}</div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isAITyping && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                marginBottom: "0.6rem",
              }}
            >
              <div
                style={{
                  maxWidth: "60%",
                  padding: "0.4rem 0.7rem",
                  borderRadius: "14px",
                  backgroundColor: "#e9ecef",
                  color: "#495057",
                  fontSize: "0.8rem",
                  fontStyle: "italic",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>AI is thinking</span>
                <span
                  style={{
                    display: "inline-block",
                    width: "4px",
                    height: "4px",
                    borderRadius: "999px",
                    backgroundColor: "#868e96",
                    boxShadow: "6px 0 0 #868e96, 12px 0 0 #868e96",
                  }}
                />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Rating bar for KB answers (between chat and footer) */}
        {pendingKbRating && (
          <div
            style={{
              padding: "0.5rem 1rem",
              borderTop: "1px solid #dee2e6",
              borderBottom: "1px solid #dee2e6",
              backgroundColor: "#fff3cd",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>How was this answer from our local knowledge base?</span>
            {[0, 1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => handleRateKb(score)}
                style={{
                  borderRadius: "999px",
                  border: "1px solid #ffc107",
                  backgroundColor: "#fffbe6",
                  padding: "0.15rem 0.45rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                }}
              >
                {score}
              </button>
            ))}
            <span style={{ marginLeft: "0.5rem", opacity: 0.8 }}>
              (0 = outrageous, 5 = great)
            </span>
          </div>
        )}

        {/* Footer: input + buttons + quick replies */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderTop: "1px solid #ddd",
            backgroundColor: "#ffffff",
          }}
        >
          {/* Input + send */}
          <form
            onSubmit={handleSend}
            style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a question about the menu, orders, or deliveries..."
              style={{
                flex: 1,
                padding: "0.55rem 0.75rem",
                borderRadius: "999px",
                border: "1px solid #ccc",
                fontSize: "0.95rem",
              }}
              disabled={loading || suggestLoading}
            />
            <button
              type="submit"
              disabled={loading || suggestLoading}
              style={{
                borderRadius: "999px",
                padding: "0.55rem 1rem",
                border: "none",
                cursor: "pointer",
                backgroundColor: loading ? "#6c757d" : "#0d6efd",
                color: "white",
                fontWeight: 500,
              }}
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </form>

          {/* Suggest + Add to cart */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              fontSize: "0.9rem",
              marginBottom: "0.5rem",
            }}
          >
            <button
              onClick={handleSuggestOrder}
              disabled={suggestLoading || loading}
              style={{
                borderRadius: "999px",
                padding: "0.4rem 0.9rem",
                border: "1px solid #0d6efd",
                backgroundColor: "#e7f1ff",
                color: "#0d6efd",
                cursor: "pointer",
              }}
            >
              {suggestLoading ? "Suggesting order..." : "Suggest an order"}
            </button>

            <button
              onClick={handleAddSuggestedToCart}
              disabled={
                !lastSuggestedItems.length ||
                !onAddToCart ||
                suggestLoading ||
                loading
              }
              style={{
                borderRadius: "999px",
                padding: "0.4rem 0.9rem",
                border: "1px solid #20c997",
                backgroundColor: !lastSuggestedItems.length
                  ? "#f1f3f5"
                  : "#e6fcf5",
                color: !lastSuggestedItems.length ? "#868e96" : "#087f5b",
                cursor:
                  !lastSuggestedItems.length || !onAddToCart
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              Add suggested order to cart
            </button>
          </div>

          {/* Quick-reply chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.4rem",
              fontSize: "0.85rem",
            }}
          >
            <span style={{ alignSelf: "center", marginRight: "0.25rem" }}>
              Quick questions:
            </span>

            <button
              type="button"
              onClick={() =>
                handleQuickAsk("What spicy dishes are available under $20?")
              }
              disabled={loading || suggestLoading}
              style={{
                borderRadius: "999px",
                border: "1px solid #ced4da",
                padding: "0.25rem 0.7rem",
                backgroundColor: "#f8f9fa",
                cursor: "pointer",
              }}
            >
              Spicy under $20
            </button>

            <button
              type="button"
              onClick={() =>
                handleQuickAsk("Show me all open delivery jobs.")
              }
              disabled={loading || suggestLoading}
              style={{
                borderRadius: "999px",
                border: "1px solid #ced4da",
                padding: "0.25rem 0.7rem",
                backgroundColor: "#f8f9fa",
                cursor: "pointer",
              }}
            >
              Show open jobs
            </button>

            <button
              type="button"
              onClick={() =>
                handleQuickAsk(
                  "Which delivery job currently has the lowest bid?"
                )
              }
              disabled={loading || suggestLoading}
              style={{
                borderRadius: "999px",
                border: "1px solid #ced4da",
                padding: "0.25rem 0.7rem",
                backgroundColor: "#f8f9fa",
                cursor: "pointer",
              }}
            >
              Lowest bid job
            </button>

            <button
              type="button"
              onClick={() =>
                handleQuickAsk(
                  "Explain how delivery bidding works in this system."
                )
              }
              disabled={loading || suggestLoading}
              style={{
                borderRadius: "999px",
                border: "1px solid #ced4da",
                padding: "0.25rem 0.7rem",
                backgroundColor: "#f8f9fa",
                cursor: "pointer",
              }}
            >
              How bidding works
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatbotPage;
