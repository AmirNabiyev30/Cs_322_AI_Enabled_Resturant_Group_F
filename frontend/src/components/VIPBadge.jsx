export default function VIPBadge({ style = {} }) {
    return (
      <span
        style={{
          padding: "0.18rem 0.55rem",
          borderRadius: "999px",
          backgroundColor: "#fff3bf",   // soft gold
          color: "#856404",
          fontSize: "0.78rem",
          fontWeight: 600,
          border: "1px solid #ffe066",
          textTransform: "uppercase",
          ...style,
        }}
      >
        ⭐ VIP
      </span>
    );
  }
  