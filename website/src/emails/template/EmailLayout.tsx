/**
 * EmailLayout — the outermost frame every institutional email shares:
 *
 *   ┌────────────────────────────────────────────┐
 *   │ [black bar: "OFFICIAL RECORD ..."]         │
 *   ├────────────────────────────────────────────┤
 *   │                                            │
 *   │     children — the email's actual body     │
 *   │                                            │
 *   ├────────────────────────────────────────────┤
 *   │ [dark footer: logo + meta cols + url]      │
 *   └────────────────────────────────────────────┘
 *
 * `topBarText` defaults to the canonical "THIS MESSAGE IS AN OFFICIAL
 * RECORD FROM THE MUSEUM OF NONHUMAN ART." but the Bulletin variant
 * passes "THIS MESSAGE IS AN OFFICIAL BULLETIN..." instead, matching
 * the mock.
 */

import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Font,
} from "@react-email/components";
import { colors, fonts, sizes } from "./styles";
import EmailFooter, { type EmailFooterProps } from "./Footer";

export interface EmailLayoutProps {
  /** Browser/preview window title. Goes in <Head>. */
  previewTitle: string;
  /** Optional plain-text preview shown by mail clients before the
   *  email is opened. Different from previewTitle. */
  previewText?: string;
  /** Black bar text. Defaults to the canonical official-record line. */
  topBarText?: string;
  /** Notice format = 600px wide. Document format (Bulletin /
   *  Registration) = 720px wide. */
  width?: "notice" | "document";
  /** Dark footer props. */
  footer: EmailFooterProps;
  children: React.ReactNode;
}

const DEFAULT_TOP_BAR =
  "THIS MESSAGE IS AN OFFICIAL RECORD FROM THE MUSEUM OF NONHUMAN ART.";

export default function EmailLayout({
  previewTitle,
  previewText,
  topBarText = DEFAULT_TOP_BAR,
  width = "notice",
  footer,
  children,
}: EmailLayoutProps) {
  const containerWidth =
    width === "document" ? sizes.documentWidth : sizes.noticeWidth;

  return (
    <Html lang="en">
      <Head>
        <title>{previewTitle}</title>
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
          backgroundColor: colors.paper,
          fontFamily: fonts.body,
          color: colors.inkSoft,
          margin: 0,
          padding: 0,
        }}
      >
        {previewText ? (
          /* Hidden preheader text — rendered by mail clients in the
             inbox preview, not in the open email. */
          <div
            style={{
              display: "none",
              fontSize: "1px",
              lineHeight: "1px",
              maxHeight: 0,
              maxWidth: 0,
              opacity: 0,
              overflow: "hidden",
              color: colors.paper,
            }}
          >
            {previewText}
          </div>
        ) : null}

        {/* Top black bar */}
        <Section
          style={{
            backgroundColor: colors.ink,
            padding: "10px 0",
            textAlign: "center",
          }}
        >
          <Text
            style={{
              fontFamily: fonts.sans,
              fontSize: "10px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#FFFFFF",
              margin: 0,
              opacity: 0.95,
            }}
          >
            {topBarText}
          </Text>
        </Section>

        {/* Paper container */}
        <Container
          style={{
            maxWidth: containerWidth,
            margin: "0 auto",
            padding: "0",
            backgroundColor: colors.paper,
          }}
        >
          {children}
        </Container>

        <EmailFooter {...footer} width={width} />
      </Body>
    </Html>
  );
}
