from playwright.sync_api import sync_playwright
import os

os.makedirs("/home/jules/verification/videos", exist_ok=True)
os.makedirs("/home/jules/verification/screenshots", exist_ok=True)

def run_cuj(page):
    # Navigate to the app
    page.goto("http://localhost:3000")
    page.wait_for_timeout(1000)

    # Find the login button and click it
    page.locator("#topbar").get_by_role("button", name="Login").click()
    page.wait_for_timeout(1000)

    # Fill in the form
    page.get_by_role("textbox", name="Email").fill("test@example.com")
    page.wait_for_timeout(500)
    page.get_by_label("Password").fill("password123")
    page.wait_for_timeout(500)

    # Take screenshot of the modal
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

    # We will submit the form but since we just have a dummy firebase config, it might fail. We just want to see the UI.
    page.get_by_label("Login").get_by_role("button", name="Login").click()
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
