# **CareSaath SRS: Home Nursing & Physiotherapy Marketplace** 

Sep 23, 2026 · @Someone 

## **1. Introduction** 

**1.1 Purpose** This document specifies the functional and non-functional requirements for a platform that connects patients and families with verified home-visiting nurses, physiotherapists, and post-surgery caregivers in Pakistan. It guides design, development, and testing. 

**1.2 Scope** The platform (working name: _CareSaath_ ) lets patients or their families search for and book verified caregivers for home visits, upload a doctor's prescription or care plan, track visit status, pay online or on visit, and rate caregivers afterward. Caregivers manage their availability and visit schedule through a dedicated panel. An admin panel handles credential verification, safety, disputes, and commissions. Version 1 covers 1–2 pilot cities. 

**1.3 Intended Audience** Founders, product managers, UI/UX designers, backend/mobile developers, QA engineers, healthcare compliance advisors, and investors evaluating the MVP. 

**1.4 Definitions and Acronyms** 

- **Caregiver** : A verified nurse, physiotherapist, or attendant offering home visits 

- **Patient** : The person receiving care 

- **Customer** : The app user booking a visit (patient or family member) 

- **SRS** : Software Requirements Specification 

- **MVP** : Minimum Viable Product 

- **OTP** : One-Time Password 

- **PMDC/PNC** : Pakistan Medical & Dental Council / Pakistan Nursing Council (professional licensing bodies) 

**1.5 References** Pakistan Nursing Council registration guidelines, JazzCash/Easypaisa merchant API docs, PTA/SECP e-commerce and data guidelines. 

**1.6 Document Overview** Section 2 gives an overall description; Sections 3–5 list functional requirements by module; Section 6 covers non-functional requirements; Section 7 covers external interfaces; Section 8 gives use case and workflow models; Section 9 covers legal, safety, future scope, and glossary. 

## **2. Overall Description** 

**2.1 Product Perspective** A new, independently built two-sided marketplace (patient/customer app + caregiver panel + admin panel). Payments route through local gateways (JazzCash, Easypaisa, Raast, card). Unlike a general services app, every caregiver profile carries a verified professional credential. 

### **2.2 Product Functions (Summary)** 

- Customers search caregivers by specialty, location, and availability, and book a visit 

- Customers upload a prescription or doctor's note where relevant 

- Caregivers manage availability, accept/decline visits, and log visit notes 

- Admins verify credentials, handle safety incidents, manage commissions, and view analytics 

### **2.3 User Classes and Characteristics** 

|Class|Description|Technical Skill|
|---|---|---|
|Customer|Patient or family member<br>booking care|Basic smartphone use|
|Caregiver|Licensed nurse, physiotherapist,<br>or attendant|Basic to moderate|
|Admin|Platform operations and<br>compliance staff|Moderate to advanced|



**2.4 Operating Environment** Android app (primary), iOS app (secondary), responsive web app for caregivers/admin. Backend hosted on cloud infrastructure with encrypted storage for health-related data. 

### **2.5 Design and Implementation Constraints** 

- Must verify caregiver licenses before activation (no unverified profile goes live) 

- Must support Urdu and English UI 

- Must support cash and digital payment on visit 

- Must comply with health data privacy norms and relevant Pakistani data protection rules 

### **2.6 Assumptions and Dependencies** 

- Caregivers hold or can obtain valid PNC/PMDC registration or equivalent certification 

- Customers have a smartphone and basic literacy to use the app, or a family member books on their behalf 

- Initial launch is limited to 1–2 pilot cities with a manually vetted caregiver pool before scaling 

## **3. Functional Requirements — Patient/Customer App** 

|ID|Requirement|
|---|---|
|FR-C1|User shall register/log in via phone number and<br>OTP|
|FR-C2|User shall create a patient profile (self or a family<br>member) with basic medical context|
|FR-C3|User shall search caregivers by specialty (nursing,<br>physiotherapy, post-surgery care), location, and<br>availability|
|FR-C4|User shall view a caregiver's profile:<br>qualifications, license number, experience,<br>ratings, and rate per visit|



|ID|Requirement|
|---|---|
|FR-C5|User shall upload a doctor's prescription or care<br>plan document with the booking|
|FR-C6|User shall book a single visit or a recurring<br>schedule (e.g., daily for 2 weeks)|
|FR-C7|User shall select visit date, time window, and<br>home address with map pin|
|FR-C8|User shall pay via cash on visit, card, JazzCash, or<br>Easypaisa|
|FR-C9|User shall track visit status (Confirmed →<br>Caregiver En Route → In Progress → Completed)|
|FR-C10|User shall receive SMS/WhatsApp/push<br>notifications at each status change|
|FR-C11|User shall view visit notes/summary left by the<br>caregiver after each visit|
|FR-C12|User shall rate and review the caregiver after a<br>completed visit|
|FR-C13|User shall cancel or reschedule a visit within a<br>defined notice window|
|FR-C14|User shall raise a safety concern or complaint tied<br>to a specific visit, escalated directly to admin|



## **4. Functional Requirements — Caregiver (Nurse/Physiotherapist) Panel** 

|ID|Requirement|
|---|---|
|FR-CG1|Caregiver shall register with name, CNIC,<br>professional license number, and certificates for<br>verification|
|FR-CG2|Caregiver shall be approved by admin, including<br>license validation, before appearing live to<br>customers|
|FR-CG3|Caregiver shall set specialty (nursing,<br>physiotherapy, elderly care, post-surgery), service<br>area, and rate per visit|
|FR-CG4|Caregiver shall set weekly availability and block|



|ID|Requirement|
|---|---|
||out unavailable dates|
|FR-CG5|Caregiver shall accept or decline incoming<br>booking requests within a set time window|
|FR-CG6|Caregiver shall view patient context and any<br>uploaded prescription before a visit|
|FR-CG7|Caregiver shall check in and check out of a visit<br>(with GPS or OTP confirmation)|
|FR-CG8|Caregiver shall submit a brief visit note/summary<br>after each visit|
|FR-CG9|Caregiver shall view earnings and request payout<br>to bank account or mobile wallet|
|FR-CG10|Caregiver shall report a safety or access issue at a<br>patient's home directly to admin|



## **5. Functional Requirements — Admin Panel** 

|ID|Requirement|
|---|---|
|FR-A1|Admin shall review caregiver license/certificate<br>documents and approve or reject registration|
|FR-A2|Admin shall re-verify caregiver credentials on a<br>periodic basis (e.g., annually)|
|FR-A3|Admin shall suspend or deactivate a caregiver for<br>policy violation or an unresolved safety complaint|
|FR-A4|Admin shall configure commission rates per<br>caregiver category|
|FR-A5|Admin shall view platform-wide analytics<br>(bookings, revenue, active caregivers,<br>cancellation rate)|
|FR-A6|Admin shall receive and manage safety incidents<br>with priority escalation and audit trail|
|FR-A7|Admin shall mediate and resolve disputes<br>between customers and caregivers|
|FR-A8|Admin shall manage promo codes and platform-<br>wide discounts|



|ID|Requirement|
|---|---|
|FR-A9|Admin shall export financial and operational|
||reports (CSV/Excel)|



## **6. Non-Functional Requirements** 

|Category|Requirement|
|---|---|
|Performance|Caregiver search results shall load in under 3<br>seconds on a 3G connection|
|Scalability|System shall support scaling from 1–2 pilot cities<br>to 10+ cities without architecture redesign|
|Security/Privacy|Patient medical documents and personal data<br>shall be encrypted at rest and in transit, with<br>access limited to the assigned caregiver and<br>admin|
|Reliability/Availability|System shall target 99.5% uptime; booking and<br>visit-status data shall not be lost on app crash or<br>network drop|
|Usability|App shall be usable by a first-time or elderly-<br>assisting user within 2 minutes, no tutorial<br>required|
|Localization|UI shall support Urdu and English, switchable in<br>settings|
|Compliance|System shall comply with SBP payment<br>regulations, applicable health-data and<br>consumer-protection rules, and caregiver<br>licensing verification standards|
|Auditability|All credential approvals, visit check-ins/check-<br>outs, and safety incidents shall be logged with<br>timestamp and actor|



## **7. External Interface Requirements** 

**7.1 User Interfaces** Native Android and iOS apps for customers and caregivers; responsive web dashboard for admin. Large-text, simple-navigation option for elderly or less tech-comfortable users booking care for themselves. 

**7.2 Payment Gateway Integration** JazzCash and Easypaisa APIs for mobile wallet payments, Raast for bank-to-bank transfers, a card gateway for card payments, and cash-on-visit handled at the booking level. 

**7.3 Communication** SMS gateway for OTP and visit alerts; WhatsApp Business API for booking confirmations and status updates. 

**7.4 Maps and Location** Google Maps Platform (or comparable) for address pinning, caregiver discovery by proximity, and check-in/check-out location capture. 

**7.5 Verification Services** Manual or semi-automated cross-check against PNC/PMDC registers (or equivalent professional body records) during caregiver onboarding. 

**7.6 Hardware/Software Constraints** Customer/caregiver apps shall run on Android 8+ and iOS 13+; admin panel shall work on current Chrome, Edge, and Safari browsers. 

## **8. System Models** 

**8.1 Use Case Summary** 

|Use Case|Customer|Caregiver|Admin|
|---|---|---|---|
|Register/Login|Yes|Yes|Yes|
|Search/list caregivers|Yes|—|—|
|Upload<br>prescription/care plan|Yes|—|—|
|Book/accept visit|Yes|Yes|—|
|Check in/out of visit|—|Yes|—|
|Track visit status|Yes|Yes|Yes|
|Make/receive payment|Yes|Yes|—|
|Rate/review|Yes|—|—|
|Verify caregiver<br>credentials|—|—|Yes|
|Handle safety incident|Yes|Yes|Yes|
|Resolve dispute|Yes|Yes|Yes|
|View analytics|—|Yes|Yes|



**8.2 Visit Lifecycle** 

```
stateDiagram-v2
  [*] --> Requested
  Requested --> Confirmed: Caregiver accepts
  Requested --> Declined: Caregiver declines
```

```
  Confirmed --> EnRoute: Visit day arrives
  EnRoute --> CheckedIn: Caregiver arrives, checks in
  CheckedIn --> InProgress: Care begins
  InProgress --> CheckedOut: Caregiver completes and checks out
  CheckedOut --> Completed: Visit note submitted
  Completed --> [*]
  Declined --> [*]
```

## **9. Other Requirements** 

**9.1 Legal and Regulatory** Business registration with SECP; caregivers verified against PNC (nursing) or relevant physiotherapy/allied-health body registration; compliance with SBP rules for digital payment handling; platform terms shall clearly define liability limits, since the platform facilitates but does not itself provide medical care. 

### **9.2 Safety and Emergency Protocol** 

- In-app emergency/SOS button during an active visit, alerting admin and an emergency contact 

- Caregiver identity and photo shown to the customer before the visit begins 

- Clear escalation path for a medical emergency during a visit (nearest hospital contact, ambulance service) 

### **9.3 Future Scope (Post-MVP)** 

- Subscription/recurring-care plans for chronic or long-term patients 

- Integration with diagnostic labs for home sample collection alongside nursing visits 

- Doctor teleconsultation add-on 

- Family dashboard to monitor an elderly relative's care remotely 

### **9.4 Glossary** 

- **Care plan** : A doctor-issued or platform-recorded set of instructions for a caregiver to follow 

- **Commission** : Percentage of visit fee retained by the platform from caregiver payouts 

- **Check-in/check-out** : Caregiver-confirmed arrival and departure at the patient's home 

