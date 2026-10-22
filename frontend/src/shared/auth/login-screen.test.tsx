import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShieldCheck } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { storeLocale } from "../__tests__/helpers";
import { ApiError } from "../api/http";
import { LoginScreen, type LoginScreenProps } from "./login-screen";

function setup(over: Partial<LoginScreenProps> = {}) {
  const requestOtp = vi.fn<LoginScreenProps["requestOtp"]>().mockResolvedValue(undefined);
  const verifyOtp = vi.fn<LoginScreenProps["verifyOtp"]>().mockResolvedValue(undefined);
  const props: LoginScreenProps = {
    product: "Caregiver app",
    headline: "Care that comes home",
    features: [{ icon: ShieldCheck, title: "Verified", text: "Every caregiver checked" }],
    heroFooter: "© CareSaath",
    phoneTitle: "Sign in",
    phoneDescription: "We'll text you a code",
    footerNote: "Secured by OTP",
    requestOtp,
    verifyOtp,
    ...over,
  };
  renderWithProviders(<LoginScreen {...props} />);
  return { requestOtp, verifyOtp, user: userEvent.setup() };
}

const phoneInput = () => screen.getByLabelText("Mobile number");
const sendButton = () => screen.getByRole("button", { name: /Send verification code/ });

async function toOtpStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(phoneInput(), "0300 1234567");
  await user.click(sendButton());
  await screen.findByRole("group", { name: "One-time code" });
}

describe("LoginScreen", () => {
  it("renders topRight, phoneHint and the phone step", () => {
    setup({ topRight: <button>اردو</button>, phoneHint: <p>Demo: 0300 0000001</p> });
    expect(screen.getByRole("button", { name: "اردو" })).toBeInTheDocument();
    expect(screen.getByText("Demo: 0300 0000001")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(phoneInput()).toHaveFocus();
  });

  it("an empty or invalid number shows the error and sends nothing", async () => {
    const { requestOtp, user } = setup();
    await user.click(sendButton());
    expect(screen.getByText("Enter your mobile number")).toBeInTheDocument();
    await user.type(phoneInput(), "0300 123");
    await user.click(sendButton());
    expect(screen.getByText(/With a leading 0, the number must be 11 digits/)).toBeInTheDocument();
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("validation messages are translated in Urdu", async () => {
    storeLocale("ur");
    const { requestOtp } = setup();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(await screen.findByText("اپنا موبائل نمبر درج کریں")).toBeInTheDocument();
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("a valid number requests an OTP in E.164 and moves to the code step", async () => {
    const { requestOtp, user } = setup();
    await toOtpStep(user);
    expect(requestOtp).toHaveBeenCalledWith("+923001234567");
    expect(screen.getByRole("heading", { name: "Check your phone" })).toBeInTheDocument();
    expect(screen.getByText(/Enter the 6-digit code/)).toHaveTextContent("+92 300 1234567");
    expect(screen.getByText(/Resend in 0:30/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled();
  });

  it("a failed OTP request shows the translated API error and stays on the phone step", async () => {
    storeLocale("ur");
    const { user } = setup({ requestOtp: vi.fn().mockRejectedValue(new ApiError(429, "Too many OTP requests, try again later")) });
    await user.type(screen.getByRole("textbox"), "03001234567");
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    const ur = (await import("../i18n/messages/ur/apiErrors.json")).default as Record<string, string>;
    expect(await screen.findByText(ur.Too_many_OTP_requests_try_again_later)).toBeInTheDocument();
  });

  it("typing the full code verifies automatically", async () => {
    const { verifyOtp, user } = setup();
    await toOtpStep(user);
    await user.click(screen.getByRole("textbox", { name: "Digit 1" }));
    await user.keyboard("123456");
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith("+923001234567", "123456"));
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("a wrong code shows the translated API error and clears the boxes", async () => {
    storeLocale("ur");
    const { user, verifyOtp } = setup();
    verifyOtp.mockRejectedValue(new ApiError(401, "Invalid OTP"));
    await user.type(screen.getByRole("textbox"), "03001234567");
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    const first = await screen.findByRole("textbox", { name: /1/ });
    fireEvent.paste(first, { clipboardData: { getData: () => "999999" } });
    expect(await screen.findByText("کوڈ درست نہیں ہے")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox").map((i) => (i as HTMLInputElement).value).join("")).toBe("");
    expect(first).toHaveAttribute("aria-invalid", "true");
  });

  it("verifyOtp resolving with a message shows it as the error", async () => {
    const { user, verifyOtp } = setup();
    verifyOtp.mockResolvedValue("This number isn't registered as a caregiver");
    await toOtpStep(user);
    fireEvent.paste(screen.getByRole("textbox", { name: "Digit 1" }), { clipboardData: { getData: () => "123456" } });
    expect(await screen.findByText("This number isn't registered as a caregiver")).toBeInTheDocument();
  });

  it("can go back to change the number", async () => {
    const { user } = setup({ codeHint: <p>Mock code 123456</p> });
    await toOtpStep(user);
    expect(screen.getByText("Mock code 123456")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Use a different number/ }));
    expect(phoneInput()).toHaveValue("0300 1234567");
  });
});
