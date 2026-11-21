import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class UpdateEditorialPageDto {
  @ApiPropertyOptional({ example: 'About Us', description: 'Page title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ example: '<h2>Our Mission</h2><p>CareSaath provides verified in-home medical care...</p>', description: 'Page HTML or rich text content' })
  @IsString()
  content!: string;
}

export class UpdateContactInfoDto {
  @ApiPropertyOptional({ example: 'info@caresaath.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'caregivers@caresaath.pk' })
  @IsOptional()
  @IsString()
  caregiverEmail?: string;

  @ApiPropertyOptional({ example: 'hello@caresaath.pk' })
  @IsOptional()
  @IsString()
  pressEmail?: string;

  @ApiPropertyOptional({ example: '+92 300 0000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '+92 300 0000000' })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({ example: 'Main Gulberg III, Lahore, Pakistan' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Mon - Sat: 9:00 AM - 9:00 PM' })
  @IsOptional()
  @IsString()
  hours?: string;
}

const DEFAULT_PAGES: Record<string, { title: string; content: string }> = {
  about: {
    title: 'About CareSaath',
    content: `<h2>Trusted Home Healthcare, Built for Pakistani Families</h2>
<p>CareSaath is a verified home healthcare marketplace connecting patients and families across Pakistan with licence-verified nurses, physiotherapists, post-surgery caregivers, elderly-care attendants, and home-visiting doctors. Whether you need an immediate nearby visit or a recurring multi-week recovery schedule, CareSaath brings clinical accountability to your doorstep.</p>

<h3>How We Verify Every Caregiver</h3>
<ul>
  <li><strong>PNC &amp; PMDC Credential Check:</strong> Every caregiver submits their CNIC (stored encrypted at rest), professional licence number, expiry date, and qualification certificates for verification against Pakistan Nursing Council (PNC) or Pakistan Medical &amp; Dental Council (PMDC) registers.</li>
  <li><strong>Manual Admin Approval:</strong> No caregiver profile appears to families automatically. Our compliance team reviews every document before approving activation.</li>
  <li><strong>Periodic Re-Verification &amp; Accountability:</strong> Active profiles undergo periodic credential reviews and may be suspended or deactivated for policy violations or unresolved safety incidents.</li>
</ul>

<h3>Safety, Communication &amp; Visit Transparency</h3>
<ul>
  <li><strong>Live Visit Lifecycle:</strong> Follow every visit from confirmation and en-route status to GPS or OTP doorstep check-in, clinical visit notes, and completion.</li>
  <li><strong>In-App Chat &amp; Calls:</strong> Communicate directly with your assigned caregiver via secure in-app messaging and audio/video calls, and share prescriptions or medical orders safely.</li>
  <li><strong>One-Tap SOS &amp; Dispute Mediation:</strong> Every active visit includes an in-app SOS alert to our safety team alongside structured dispute resolution.</li>
</ul>

<h3>Built for Pakistan</h3>
<ul>
  <li><strong>Bilingual App:</strong> Full Urdu and English experience across customer, caregiver, and family workflows.</li>
  <li><strong>Flexible Local Payments &amp; Receipts:</strong> Pay in cash on the visit or digitally via Card, JazzCash, or Easypaisa, with downloadable PDF receipts and promo code support.</li>
  <li><strong>Encrypted Health Records:</strong> Prescriptions, CNICs, payout accounts, and patient profiles are encrypted in transit and at rest with full audit logging.</li>
</ul>`,
  },
  terms: {
    title: 'Terms of Service',
    content: `<p>These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the CareSaath web and mobile applications, verified caregiver bookings, and home-visit coordination services across Pakistan. By creating an account or booking a visit, you agree to be bound by these Terms. Please read the safety and liability sections carefully.</p>

<h2>1. What CareSaath Is</h2>
<p>CareSaath operates a two-sided digital marketplace connecting customers and families with independent, credential-verified nurses, physiotherapists, post-surgery caregivers, elderly-care attendants, and home-visiting doctors. CareSaath facilitates caregiver discovery, credential verification, scheduling, in-app chat/calls, safety tooling (GPS/OTP check-in and SOS escalation), and payment processing. <strong>CareSaath does not itself practise medicine or directly provide clinical care</strong>; clinical care delivered during a visit is the independent professional responsibility of the attending caregiver.</p>

<h2>2. Accounts &amp; Eligibility</h2>
<ul>
  <li>Accounts are authenticated via your mobile phone number and a one-time passcode (OTP) delivered via WhatsApp, SMS, or email. You are responsible for all activity under your account.</li>
  <li>You must be at least 18 years old to create an account and must provide accurate personal details and honest medical context for every patient profile.</li>
  <li>You may book home care for yourself or on behalf of a family member, provided you are authorised to share their health and address details.</li>
</ul>

<h2>3. Verified Caregivers</h2>
<ul>
  <li>Caregivers submit their CNIC, professional licence (PNC, PMDC, or relevant board), and qualification certificates for manual admin review before their profile is activated.</li>
  <li>Caregivers manage their service areas, weekly availability schedule, and live &ldquo;Available Now&rdquo; status for immediate nearby requests.</li>
  <li>CareSaath reserves the right to issue strikes, suspend, or permanently deactivate any caregiver for misconduct, misrepresentation of credentials, harassment, or an unresolved safety incident.</li>
</ul>

<h2>4. Bookings, Payments &amp; Cancellations</h2>
<ul>
  <li>You may book a single visit, an immediate nearby visit (when a caregiver is available now), or a recurring weekly schedule. The full visit fee in PKR and any eligible promo discount are displayed before you confirm.</li>
  <li>Payments may be settled in <strong>Cash</strong> on the visit or digitally via <strong>Card</strong>, <strong>JazzCash</strong>, or <strong>Easypaisa</strong>, with downloadable PDF receipts for completed payments.</li>
  <li>CareSaath retains a platform commission per specialty from completed visits; net earnings are disbursed to the caregiver&rsquo;s verified Bank or Mobile Wallet (JazzCash/Easypaisa) payout account.</li>
  <li>Cancellations and rescheduling are permitted in accordance with the booking notice rules shown in the app.</li>
</ul>

<h2>5. Conduct, Safety &amp; SOS Protocol</h2>
<ul>
  <li>Both families and caregivers must treat each other with dignity, privacy, and professional respect at all times.</li>
  <li>Visits use GPS geofencing or OTP verification at check-in and check-out to maintain a tamper-evident audit trail.</li>
  <li>An in-app SOS button is available throughout every active visit to alert the CareSaath safety desk and your emergency contact.</li>
</ul>

<h2>6. Disputes &amp; Resolution</h2>
<p>If an issue arises regarding visit quality, billing, or conduct, either the customer or the caregiver may open a formal dispute tied to the visit. CareSaath admin staff review visit logs, check-in timestamps, chat records, and supporting evidence to record a documented mediation decision.</p>

<h2>7. Medical Emergencies &amp; Limitation of Liability</h2>
<p><strong>CareSaath is not an emergency medical dispatch service.</strong> In any life-threatening emergency (such as chest pain, severe bleeding, stroke symptoms, or acute respiratory distress), immediately call local emergency services (<strong>Rescue 1122</strong>) or proceed to the nearest hospital emergency department. CareSaath&rsquo;s liability is limited to the extent permitted under applicable laws of Pakistan, including the Contract Act, 1872.</p>

<h2>8. Governing Law &amp; Contact</h2>
<p>We may update these Terms as CareSaath grows; continued use constitutes acceptance of the current version. These Terms are governed by the laws of the Islamic Republic of Pakistan. Questions regarding these Terms may be directed to <a href="mailto:info@caresaath.com">info@caresaath.com</a>.</p>`,
  },
  privacy: {
    title: 'Privacy Policy',
    content: `<p>CareSaath connects families across Pakistan with verified home-visiting nurses, physiotherapists, doctors, and caregivers. Because home healthcare involves sensitive personal and medical information, protecting your privacy is foundational to our platform. This Privacy Policy explains what data we collect, how we use and safeguard it, when it is shared, and the choices you have.</p>

<h2>1. Information We Collect</h2>
<ul>
  <li><strong>Account &amp; Identity Details:</strong> Your mobile phone number (used for OTP sign-in and visit notifications), full name, optional email address, and preferred language (Urdu or English).</li>
  <li><strong>Patient Profiles &amp; Health Context:</strong> Patient name, relationship (self or family member), date of birth, and basic medical context you provide for safe care delivery.</li>
  <li><strong>Service Addresses &amp; Location Data:</strong> Home addresses, map pins, and GPS coordinates captured during caregiver visit check-in, check-out, nearby immediate bookings, and SOS alerts.</li>
  <li><strong>Medical &amp; Verification Documents:</strong> Prescriptions, medical orders, and visit notes uploaded for care coordination, as well as caregiver CNICs, PNC/PMDC licences, and qualification certificates.</li>
  <li><strong>Communications &amp; Visit History:</strong> Booking schedules, visit status transitions, in-app chat messages, call logs, ratings, reviews, and any dispute or safety incident records.</li>
  <li><strong>Payment &amp; Payout Information:</strong> Selected payment method (Cash, Card, JazzCash, or Easypaisa), gateway transaction references, and encrypted caregiver Bank/Mobile Wallet payout details. Card payments are processed by licensed payment providers — CareSaath does not store full card numbers.</li>
</ul>

<h2>2. How We Use Your Information</h2>
<ul>
  <li>To match you with verified caregivers in your service area, coordinate single, recurring, or immediate visits, and share essential patient context with the assigned caregiver.</li>
  <li>To verify caregiver identities and professional credentials against PNC and PMDC registers before activation and during periodic reviews.</li>
  <li>To process customer payments, promo codes, refunds, PDF receipts, and caregiver payouts.</li>
  <li>To operate safety controls including GPS/OTP check-in, in-app SOS alerts, safety investigations, and dispute resolution.</li>
  <li>To deliver transactional OTPs and booking updates via WhatsApp, SMS, email, and push notifications based on your notification preferences.</li>
  <li>To comply with applicable Pakistani legal, regulatory, and audit obligations.</li>
</ul>

<h2>3. How We Protect Your Data</h2>
<p>Sensitive fields including caregiver CNIC numbers, payout account details, and medical data are encrypted at rest, and all traffic is protected in transit via TLS. Access to patient details is strictly restricted to the assigned caregiver during an active booking and authorised CareSaath admin personnel. Credential approvals, visit check-ins/check-outs, and safety events are logged in an audit trail with actor and timestamp.</p>

<h2>4. When We Share Information</h2>
<ul>
  <li><strong>Assigned Caregiver:</strong> Only the patient profile, address, prescriptions, and visit details required to safely perform the confirmed visit.</li>
  <li><strong>Payment Providers:</strong> Licensed payment gateways (Card, JazzCash, Easypaisa) solely to process transactions you initiate.</li>
  <li><strong>Safety &amp; Emergency Escalation:</strong> Designated emergency contacts or public emergency responders (such as Rescue 1122) if an SOS alert is triggered during a visit.</li>
  <li><strong>Legal &amp; Regulatory Authorities:</strong> Where required by Pakistani law, court order, or statutory compliance (including PECA 2016).</li>
</ul>
<p><strong>We never sell or rent your personal or health information to third parties or advertisers.</strong></p>

<h2>5. Data Retention &amp; Your Choices</h2>
<ul>
  <li>You can view and update your account details, patient profiles, and saved addresses directly in the CareSaath app at any time.</li>
  <li>You can switch between Urdu and English and manage WhatsApp, SMS, email, and push notification preferences in your settings.</li>
  <li>You may remove a patient profile or address when it is not linked to an active booking, or contact support for account deactivation or privacy inquiries.</li>
  <li>Audit logs and statutory financial/safety records are retained only as required by law and clinical accountability standards.</li>
</ul>

<h2>6. Contacting Us</h2>
<p>We may update this Privacy Policy as CareSaath evolves; material changes will be published on this page with an updated revision date. Questions about your privacy or data rights can be sent to <a href="mailto:info@caresaath.com">info@caresaath.com</a>.</p>`,
  },
};

const DEFAULT_CONTACT_INFO = {
  email: 'info@caresaath.com',
  caregiverEmail: 'caregivers@caresaath.pk',
  pressEmail: 'hello@caresaath.pk',
  phone: '+92 42 111 227 372',
  whatsapp: '+92 300 2273728',
  address: 'Main Gulberg III, Lahore, Pakistan',
  hours: 'Mon – Sat: 9:00 AM – 9:00 PM PKT (24/7 Visit SOS Support)',
};

@Injectable()
export class EditorialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPages() {
    const keys = Object.keys(DEFAULT_PAGES).map((slug) => `editorial.page.${slug}`);
    const rows = await this.prisma.platformConfig.findMany({
      where: { key: { in: keys } },
    });
    const map = new Map(rows.map((r) => [r.key, r]));

    return Object.keys(DEFAULT_PAGES).map((slug) => {
      const row = map.get(`editorial.page.${slug}`);
      const val = row?.value as { title?: string; content?: string } | undefined;
      return {
        slug,
        title: val?.title ?? DEFAULT_PAGES[slug].title,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async getPage(slug: string) {
    const key = `editorial.page.${slug}`;
    const row = await this.prisma.platformConfig.findUnique({ where: { key } });
    if (!row && !DEFAULT_PAGES[slug]) {
      throw new NotFoundException(`Editorial page "${slug}" not found`);
    }
    const val = row?.value as { title?: string; content?: string } | undefined;
    const defaultData = DEFAULT_PAGES[slug] ?? { title: slug, content: '' };
    return {
      slug,
      title: val?.title ?? defaultData.title,
      content: val?.content ?? defaultData.content,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async updatePage(admin: AuthUser, slug: string, dto: UpdateEditorialPageDto) {
    const key = `editorial.page.${slug}`;
    const defaultData = DEFAULT_PAGES[slug] ?? { title: slug, content: '' };
    const title = dto.title || defaultData.title;
    const data = { title, content: dto.content };
    await this.prisma.platformConfig.upsert({
      where: { key },
      update: { value: data },
      create: { key, value: data },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'editorial.page_updated',
      entityType: 'EditorialPage',
      entityId: slug,
      metadata: { title },
    });
    return { slug, ...data };
  }

  async getContactInfo() {
    const row = await this.prisma.platformConfig.findUnique({
      where: { key: 'editorial.contactInfo' },
    });
    if (!row) return DEFAULT_CONTACT_INFO;
    return { ...DEFAULT_CONTACT_INFO, ...(row.value as object) };
  }

  async updateContactInfo(admin: AuthUser, dto: UpdateContactInfoDto) {
    const existing = await this.getContactInfo();
    const updated = {
      ...existing,
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.caregiverEmail !== undefined ? { caregiverEmail: dto.caregiverEmail } : {}),
      ...(dto.pressEmail !== undefined ? { pressEmail: dto.pressEmail } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.hours !== undefined ? { hours: dto.hours } : {}),
    };
    await this.prisma.platformConfig.upsert({
      where: { key: 'editorial.contactInfo' },
      update: { value: updated },
      create: { key: 'editorial.contactInfo', value: updated },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'editorial.contact_info_updated',
      entityType: 'ContactInfo',
      entityId: 'global',
    });
    return updated;
  }
}

@ApiTags('Public - Editorial')
@Public()
@Controller('editorial')
export class EditorialPublicController {
  constructor(private readonly editorial: EditorialService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List all editorial pages' })
  listPages() {
    return this.editorial.listPages();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get editorial page content by slug' })
  getPage(@Param('slug') slug: string) {
    return this.editorial.getPage(slug);
  }

  @Get('contact-info')
  @ApiOperation({ summary: 'Get platform public contact information' })
  getContactInfo() {
    return this.editorial.getContactInfo();
  }
}

@ApiTags('Admin - Editorial')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/editorial')
export class AdminEditorialController {
  constructor(private readonly editorial: EditorialService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List editorial pages' })
  listPages() {
    return this.editorial.listPages();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get editorial page' })
  getPage(@Param('slug') slug: string) {
    return this.editorial.getPage(slug);
  }

  @Put('pages/:slug')
  @ApiOperation({ summary: 'Update editorial page content' })
  updatePage(
    @CurrentUser() admin: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateEditorialPageDto,
  ) {
    return this.editorial.updatePage(admin, slug, dto);
  }

  @Get('contact-info')
  @ApiOperation({ summary: 'Get contact info' })
  getContactInfo() {
    return this.editorial.getContactInfo();
  }

  @Put('contact-info')
  @ApiOperation({ summary: 'Update contact info' })
  updateContactInfo(
    @CurrentUser() admin: AuthUser,
    @Body() dto: UpdateContactInfoDto,
  ) {
    return this.editorial.updateContactInfo(admin, dto);
  }
}

@Module({
  controllers: [EditorialPublicController, AdminEditorialController],
  providers: [EditorialService],
  exports: [EditorialService],
})
export class EditorialModule {}
