import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Link,
  Button,
  Img,
  Font,
} from "@react-email/components";

export interface NewsletterConfirmationProps {
  confirmationUrl: string;
}

const muted = "#666666";
const fg = "#1a1a1a";
const border = "#d4d4d4";

const MNALogo = () => (
  <Img
    src="https://mnamuseum.org/mna-logo-email.png"
    alt="Museum of Nonhuman Art"
    width="180"
    height="68"
    style={{ display: "block", margin: "0 auto" }}
  />
);

export default function NewsletterConfirmation({
  confirmationUrl,
}: NewsletterConfirmationProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Georgia"
          fallbackFontFamily="serif"
          webFont={undefined}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: fg,
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "48px 40px",
          }}
        >
          {/* Header */}
          <Section style={{ marginBottom: "40px", textAlign: "center" }}>
            <MNALogo />
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Title */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: muted,
                margin: "0 0 8px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              Double Opt-In
            </Text>
            <Text
              style={{
                fontSize: "24px",
                fontWeight: 400,
                color: fg,
                margin: 0,
                letterSpacing: "0.02em",
                fontFamily: "Georgia, serif",
              }}
            >
              Subscription Confirmation
            </Text>
          </Section>

          {/* Body */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.7",
                color: fg,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              Please confirm this subscription to receive occasional notice
              when the Museum of Nonhuman Art opens new exhibitions or
              accessions significant works. No promotional content, no
              tracking, no third-party sharing. You may unsubscribe at any
              time from any message we send.
            </Text>
          </Section>

          {/* Confirm button */}
          <Section style={{ marginBottom: "32px", textAlign: "center" }}>
            <Button
              href={confirmationUrl}
              style={{
                backgroundColor: fg,
                color: "#ffffff",
                padding: "14px 28px",
                textDecoration: "none",
                fontSize: "12px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
                display: "inline-block",
              }}
            >
              Confirm Subscription
            </Button>
          </Section>

          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "12px",
                lineHeight: "1.6",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              If the button does not work, copy and paste this link into your
              browser:
              <br />
              <Link
                href={confirmationUrl}
                style={{ color: muted, wordBreak: "break-all" }}
              >
                {confirmationUrl}
              </Link>
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 24px 0" }} />

          {/* Footer */}
          <Section>
            <Text
              style={{
                fontSize: "12px",
                lineHeight: "1.6",
                color: muted,
                margin: "0 0 8px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              If you did not request this subscription, no action is required.
              Without confirmation, no further mail will be sent to this
              address.
            </Text>
            <Text
              style={{
                fontSize: "11px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              Museum of Nonhuman Art — U3 Labs, LLC — Florida, United States
              of America —{" "}
              <Link
                href="https://mnamuseum.org"
                style={{ color: muted, textDecoration: "none" }}
              >
                mnamuseum.org
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
