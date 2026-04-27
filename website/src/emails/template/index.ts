/**
 * Public surface of the institutional-email template module.
 *
 * Per-email templates (NoticeOfAccession, NoticeOfRejection,
 * RegistrationConfirmation, MonthlyDigest aka Institutional Bulletin)
 * compose these atoms to produce their final markup.
 */

export { default as EmailLayout } from "./EmailLayout";
export type { EmailLayoutProps } from "./EmailLayout";

export { default as EmailHeader } from "./Header";
export type { EmailHeaderProps, MetaPair } from "./Header";

export { default as EmailFooter } from "./Footer";
export type { EmailFooterProps } from "./Footer";

export { default as CouncilSummary } from "./CouncilSummary";
export type { CouncilEntry } from "./CouncilSummary";

export {
  MetaList,
  StatusLine,
  ConsensusRow,
  StatusHero,
  CTA,
  CTARow,
  Motto,
  SectionTitle,
  BlockTitle,
} from "./atoms";

export { colors, fonts, sizes, textStyles } from "./styles";
