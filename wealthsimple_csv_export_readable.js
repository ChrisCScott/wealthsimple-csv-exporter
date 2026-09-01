javascript: (() => {
	/*
	 * Wealthsimple Transaction Export Bookmarklet
	 * Version: 0.2.3
	 * Features:
	 * - Exports to CSV (Date, Payee, Amount)
	 * - Formats Date as YYYY-MM-DD (compatible with YNAB/Excel)
	 * - Skips "Pending" transactions
	 * - Handles "Today"/"Yesterday" and standard dates
	 * - Parses transaction rows directly from innerText (robust to DOM changes)
	 * - Allows legitimate duplicate transactions (same date/payee/amount on different days)
	 * - Deduplicates by element ID to prevent re-processing
	 */

	function cleanAmount(str) {
		// Normalize various minus/dash characters, remove commas, strip non-numeric
		return parseFloat(
			str
				.replace(/[−\u2212\u2013\u2014]/g, "-")
				.replace(/,/g, "")
				.replace(/[^\d.-]/g, ""),
		);
	}

	function formatDate(dateStr) {
		const today = new Date();
		let date;
		if (dateStr === "Today") {
			date = today;
		} else if (dateStr === "Yesterday") {
			date = new Date(today);
			date.setDate(today.getDate() - 1);
		} else {
			date = new Date(dateStr);
			if (!/\d{4}/.test(dateStr)) date.setFullYear(today.getFullYear());
		}
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	// Instead of assuming a single container, scan the page for transaction
	// elements (those containing a CAD amount) and locate each transaction's
	// date by walking previous siblings and ancestors. This is more robust to
	// DOM changes that move the feed around.
	const candidates = [...document.querySelectorAll("*")].filter((el) =>
		el.innerText && el.innerText.includes("CAD") && el.innerText.includes("$") && !el.innerText.includes("Pending"),
	);

	// Matches date headers like "Today", "Yesterday", or "August 28, 2026"
	const headingRegex = /^(Today|Yesterday)$|^\w+ \d{1,2}(, \d{4})?$/;

	const rows = [];
	const seen = new Set();

	function findDateForElement(el) {
		const headingRegex = /^(Today|Yesterday)$|^\w+ \d{1,2}(, \d{4})?$/;
		let node = el;
		while (node) {
			// Check previous element siblings first
			let sib = node.previousElementSibling;
			while (sib) {
				const h = sib.querySelector("h1, h2, h3, h4, h5, h6");
				const text = h ? h.innerText.trim() : (sib.innerText && sib.innerText.trim());
				if (text && headingRegex.test(text)) return formatDate(text);
				sib = sib.previousElementSibling;
			}
			node = node.parentElement;
		}
		return null;
	}

	function isAmountOnlyLine(s) {
		if (!s) return false;
		s = s.trim();
		return /^[-−\u2212\u2013\u2014]?\s*\$[\d,]+(?:\.\d{1,2})?\s*CAD$/i.test(s);
	}

	for (const el of candidates) {
		const currentDate = findDateForElement(el);
		if (!currentDate) continue;

		const text = el.innerText && el.innerText.trim();
		if (!text) continue;

		const parts = text
			.split(/\n+/)
			.map((s) => s.trim())
			.filter(Boolean);
		// Skip elements that are just the amount (they cause duplicate rows).
		if (parts.length === 1 && isAmountOnlyLine(parts[0])) continue;

		const payee = parts[0];
		// If the first line is itself a date header, skip — it's not a transaction
		if (headingRegex.test(payee)) continue;
		const amountPart = parts.find((p) => p.includes("CAD") && p.includes("$"));
		if (!payee || !amountPart) continue;

		const amount = cleanAmount(amountPart);
		if (Number.isNaN(amount)) continue;

		const button = el.querySelector('button[id]');
		const buttonId = button?.id || '';
		const uid = currentDate + payee + amount + buttonId;
		if (!seen.has(uid)) {
			seen.add(uid);
			rows.push([currentDate, `"${payee.replace(/"/g, '""')}"`, amount].join(","));
		}
	}

	if (rows.length === 0) {
		const url = window.location.href;
		const dollarCount = (document.body.innerText.match(/\$/g) || []).length;
		let msg = "No completed transactions found.\n\n";
		if (!url.includes("wealthsimple.com")) {
			msg +=
				"You don't appear to be on Wealthsimple.\nNavigate to my.wealthsimple.com/activity first.";
		} else if (dollarCount === 0) {
			msg +=
				"No dollar amounts found on page.\nMake sure you're on the Activity page.";
		} else {
			msg +=
				"Tip: Scroll down to load more transactions before clicking.\n\n" +
				"If transactions are visible but not exporting, please report at:\n" +
				"github.com/dizzlkheinz/wealthsimple-csv-exporter/issues";
		}
		alert(msg);
		return;
	}

	const csvContent = `Date,Payee,Amount\n${rows.join("\n")}`;
	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "wealthsimple_activity.csv";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
})();
