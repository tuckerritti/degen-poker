import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

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
    if (!feedback || feedback.trim().length === 0) {
      return NextResponse.json(
        { error: "Feedback text is required" },
        { status: 400 }
      );
    }

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
        { status: 500 }
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
          <p style="margin: 5px 0;"><strong>Time:</strong> ${timestamp}</p>
          <p style="margin: 5px 0;"><strong>Room ID:</strong> ${roomId}</p>
          <p style="margin: 5px 0;"><strong>Player Name:</strong> ${playerName}</p>
          <p style="margin: 5px 0;"><strong>Player ID:</strong> ${playerId || "N/A"}</p>
          <p style="margin: 5px 0;"><strong>Auth User ID:</strong> ${authUserId || "N/A"}</p>
        </div>

        <h3 style="color: #333; margin-top: 20px;">Feedback:</h3>
        <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
${feedback}
        </div>

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />

        <p style="font-size: 12px; color: #666;">
          <strong>User Agent:</strong> ${userAgent || "N/A"}
        </p>
      </div>
    `;

    const emailText = `
New Poker Feedback

Time: ${timestamp}
Room ID: ${roomId}
Player Name: ${playerName}
Player ID: ${playerId || "N/A"}
Auth User ID: ${authUserId || "N/A"}

Feedback:
${feedback}

---
User Agent: ${userAgent || "N/A"}
    `;

    // Send email
    const info = await transporter.sendMail({
      from: process.env.FEEDBACK_FROM_EMAIL,
      to: process.env.FEEDBACK_TO_EMAIL,
      subject: `Poker Feedback from ${playerName} (Room: ${roomId})`,
      html: emailHtml,
      text: emailText,
    });

    console.log("Feedback email sent:", info.messageId);

    return NextResponse.json(
      { success: true, messageId: info.messageId },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending feedback email:", error);

    // Check if it's a rate limit error
    if (error instanceof Error && error.message.includes("rate limit")) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Failed to send feedback" },
      { status: 500 }
    );
  }
}
