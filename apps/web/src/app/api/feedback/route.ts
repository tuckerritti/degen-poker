import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const MAX_FEEDBACK_LENGTH = 1000;
const MAX_PLAYER_NAME_LENGTH = 80;
const MAX_ROOM_ID_LENGTH = 80;
const MAX_USER_AGENT_LENGTH = 300;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const normalizeSubject = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLength);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      roomId,
      playerName,
      playerId,
      authUserId,
      feedback,
      userAgent,
      timestamp,
    } = body;

    // Validate required fields
    const feedbackText = normalizeText(feedback, MAX_FEEDBACK_LENGTH);
    if (!feedbackText) {
      return NextResponse.json(
        { error: "Feedback text is required" },
        { status: 400 },
      );
    }
    if (
      typeof feedback === "string" &&
      feedback.trim().length > MAX_FEEDBACK_LENGTH
    ) {
      return NextResponse.json(
        { error: `Feedback must be ${MAX_FEEDBACK_LENGTH} characters or less` },
        { status: 400 },
      );
    }

    const safeRoomId = normalizeText(roomId, MAX_ROOM_ID_LENGTH);
    const safePlayerName =
      normalizeText(playerName, MAX_PLAYER_NAME_LENGTH) || "Anonymous";
    const safePlayerId = normalizeText(playerId, MAX_ROOM_ID_LENGTH);
    const safeAuthUserId = normalizeText(authUserId, MAX_ROOM_ID_LENGTH);
    const safeUserAgent = normalizeText(userAgent, MAX_USER_AGENT_LENGTH);

    const safeTimestamp = (() => {
      if (
        typeof timestamp === "string" &&
        !Number.isNaN(Date.parse(timestamp))
      ) {
        return timestamp;
      }
      return new Date().toISOString();
    })();

    // Validate environment variables
    if (
      !process.env.GMAIL_USER ||
      !process.env.GMAIL_APP_PASSWORD ||
      !process.env.FEEDBACK_FROM_EMAIL ||
      !process.env.FEEDBACK_TO_EMAIL
    ) {
      console.error("Missing Gmail configuration environment variables");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 },
      );
    }

    // Configure Gmail SMTP transport
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // Prepare email content
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; border-bottom: 2px solid #C9A961; padding-bottom: 10px;">
          New Poker Feedback
        </h2>

        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Time:</strong> ${escapeHtml(
            safeTimestamp,
          )}</p>
          <p style="margin: 5px 0;"><strong>Room ID:</strong> ${escapeHtml(
            safeRoomId || "N/A",
          )}</p>
          <p style="margin: 5px 0;"><strong>Player Name:</strong> ${escapeHtml(
            safePlayerName,
          )}</p>
          <p style="margin: 5px 0;"><strong>Player ID:</strong> ${escapeHtml(
            safePlayerId || "N/A",
          )}</p>
          <p style="margin: 5px 0;"><strong>Auth User ID:</strong> ${escapeHtml(
            safeAuthUserId || "N/A",
          )}</p>
        </div>

        <h3 style="color: #333; margin-top: 20px;">Feedback:</h3>
        <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
${escapeHtml(feedbackText)}
        </div>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />

        <p style="font-size: 12px; color: #666;">
          <strong>User Agent:</strong> ${escapeHtml(safeUserAgent || "N/A")}
        </p>
      </div>
    `;

    const emailText = `
New Poker Feedback

Time: ${safeTimestamp}
Room ID: ${safeRoomId || "N/A"}
Player Name: ${safePlayerName}
Player ID: ${safePlayerId || "N/A"}
Auth User ID: ${safeAuthUserId || "N/A"}

Feedback:
${feedbackText}

---
User Agent: ${safeUserAgent || "N/A"}
    `;

    // Send email
    const info = await transporter.sendMail({
      from: process.env.FEEDBACK_FROM_EMAIL,
      to: process.env.FEEDBACK_TO_EMAIL,
      subject: normalizeSubject(
        `Poker Feedback from ${safePlayerName} (Room: ${safeRoomId || "N/A"})`,
        160,
      ),
      html: emailHtml,
      text: emailText,
    });

    console.log("Feedback email sent:", info.messageId);

    return NextResponse.json(
      { success: true, messageId: info.messageId },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error sending feedback email:", error);

    // Log detailed error information for debugging
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    // Check if it's a rate limit error
    if (error instanceof Error && error.message.includes("rate limit")) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    // Return more specific error message for debugging
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      process.env.NODE_ENV === "production"
        ? { error: "Failed to send feedback" }
        : { error: "Failed to send feedback", details: errorMessage },
      { status: 500 },
    );
  }
}
