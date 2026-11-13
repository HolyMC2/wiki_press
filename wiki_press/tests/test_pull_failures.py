"""A pull source whose remote is gone backs off and logs once.

The case it guards: a tenant help copy whose hub repo is not where its
remote_url points (a site moved to another cell while the hub stayed on the
first one's bench). Every 30-minute run used to raise before the source
recorded anything, so the source never showed the error and each run added an
Error Log row.
"""

import os
import subprocess
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, get_datetime, now_datetime

from wiki_press.git_publish import publish_target
from wiki_press.git_pull import backoff_minutes, pull_all_enabled, pull_source
from wiki_press.tests.test_distribution import HubFixture, _make_space


class TestPullFailureBackoff(HubFixture, FrappeTestCase):
	def _source(self, space: str, remote: str, subdir: str = "manual"):
		return frappe.get_doc(
			{
				"doctype": "Wiki Pull Source",
				"space": space,
				"remote_url": f"file://{remote}",
				"branch": "main",
				"docs_subdir": subdir,
			}
		).insert()

	def _state(self, name: str):
		return frappe.db.get_value(
			"Wiki Pull Source",
			name,
			["last_status", "last_error", "consecutive_failures", "next_attempt_after"],
			as_dict=True,
		)

	def _error_logs(self, name: str) -> int:
		return frappe.db.count(
			"Error Log", {"reference_doctype": "Wiki Pull Source", "reference_name": name}
		)

	def _run_schedule(self, name: str) -> list[str]:
		"""Run pull_all_enabled; return which of this test's sources it queued
		and run those jobs inline (other tests' sources are only queued)."""
		queued = []
		with patch("frappe.enqueue", side_effect=lambda method, **kw: queued.append((method, kw))):
			pull_all_enabled()
		mine = []
		for method, kw in queued:
			self.assertEqual(method, "wiki_press.git_pull.pull_source")
			self.assertTrue(kw["deduplicate"])
			if kw["source_name"] == name:
				mine.append(name)
				pull_source(name)
		return mine

	def _publish_into(self, hub: str, suffix: str, pages: dict[str, str]) -> None:
		master = _make_space(suffix, "pf-src", pages)
		target = frappe.get_doc(
			{
				"doctype": "Wiki Publish Target",
				"space": master.name,
				"remote_url": f"file://{hub}",
				"branch": "main",
				"docs_subdir": "manual",
			}
		).insert()
		self.assertTrue(publish_target(target.name)["pushed"])

	def test_backoff_doubles_from_half_an_hour_to_a_day(self):
		self.assertEqual(backoff_minutes(0), 0)
		self.assertEqual(
			[backoff_minutes(n) for n in range(1, 9)], [30, 60, 120, 240, 480, 960, 1440, 1440]
		)
		self.assertEqual(backoff_minutes(500), 1440)

	def test_missing_hub_backs_off_logs_once_and_recovers(self):
		moved = os.path.join(self.tmp, "moved-hub.git")  # nothing there yet
		mirror = _make_space(f"f{self.suffix}", "pf-dst", {})
		source = self._source(mirror.name, moved)
		logs_before = self._error_logs(source.name)

		# First scheduled run: the source is due, the fetch fails.
		self.assertEqual(self._run_schedule(source.name), [source.name])
		state = self._state(source.name)
		self.assertEqual(state.last_status, "Error")
		self.assertIn("git fetch failed", state.last_error)
		self.assertIn("does not appear to be a git repository", state.last_error)
		self.assertEqual(state.consecutive_failures, 1)
		self.assertGreater(get_datetime(state.next_attempt_after), add_to_date(now_datetime(), minutes=25))
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

		# Second run inside the wait: not queued, nothing logged.
		self.assertEqual(self._run_schedule(source.name), [])
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

		# A manual pull still tries; the same error counts but is not logged again.
		result = pull_source(source.name)
		self.assertFalse(result["synced"])
		self.assertEqual(result["reason"], "fetch-failed")
		state = self._state(source.name)
		self.assertEqual(state.consecutive_failures, 2)
		self.assertGreater(get_datetime(state.next_attempt_after), add_to_date(now_datetime(), minutes=55))
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

		# The hub comes back with content. Once the wait is over, the schedule
		# pulls it and the source is clean again.
		subprocess.run(["git", "init", "-q", "--bare", "-b", "main", moved], check=True)
		self._publish_into(moved, f"s{self.suffix}", {"Vuelve": "# Vuelve\n\nDe nuevo aquí.\n"})
		frappe.db.set_value(
			"Wiki Pull Source",
			source.name,
			"next_attempt_after",
			add_to_date(now_datetime(), minutes=-1),
			update_modified=False,
		)
		self.assertEqual(self._run_schedule(source.name), [source.name])
		state = self._state(source.name)
		self.assertEqual(state.last_status, "Success")
		self.assertFalse(state.last_error)
		self.assertEqual(state.consecutive_failures, 0)
		self.assertIsNone(state.next_attempt_after)
		titles = set(
			frappe.get_all(
				"Wiki Document",
				filters={"route": ["like", f"{mirror.route}/%"], "is_group": 0},
				pluck="title",
			)
		)
		self.assertIn("Vuelve", titles)
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

	def test_logs_again_after_a_day_or_when_the_error_changes(self):
		mirror = _make_space(f"g{self.suffix}", "pf-day", {})
		source = self._source(mirror.name, os.path.join(self.tmp, "gone.git"))
		logs_before = self._error_logs(source.name)

		pull_source(source.name)
		pull_source(source.name)
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

		# The only log is now a day old: the next failure logs again.
		last = frappe.get_all(
			"Error Log",
			filters={"reference_doctype": "Wiki Pull Source", "reference_name": source.name},
			pluck="name",
			order_by="creation desc",
			limit=1,
		)[0]
		frappe.db.set_value(
			"Error Log", last, "creation", add_to_date(now_datetime(), hours=-25), update_modified=False
		)
		pull_source(source.name)
		self.assertEqual(self._error_logs(source.name) - logs_before, 2)

		# A different error logs at once, inside the day.
		frappe.db.set_value(
			"Wiki Pull Source",
			source.name,
			"remote_url",
			f"file://{os.path.join(self.tmp, 'elsewhere.git')}",
			update_modified=False,
		)
		pull_source(source.name)
		self.assertEqual(self._error_logs(source.name) - logs_before, 3)
		self.assertEqual(self._state(source.name).consecutive_failures, 4)

	def test_repointing_the_source_clears_the_wait(self):
		mirror = _make_space(f"r{self.suffix}", "pf-rep", {})
		source = self._source(mirror.name, os.path.join(self.tmp, "old.git"))
		pull_source(source.name)
		self.assertEqual(self._state(source.name).consecutive_failures, 1)

		doc = frappe.get_doc("Wiki Pull Source", source.name)
		doc.save()  # nothing that matters changed: the wait stays
		self.assertEqual(self._state(source.name).consecutive_failures, 1)
		self.assertIsNotNone(self._state(source.name).next_attempt_after)

		doc = frappe.get_doc("Wiki Pull Source", source.name)
		doc.remote_url = f"file://{self.hub}"
		doc.save()
		state = self._state(source.name)
		self.assertEqual(state.consecutive_failures, 0)
		self.assertIsNone(state.next_attempt_after)

	def test_wipe_guard_counts_and_logs_once(self):
		self._publish_into(self.hub, f"w{self.suffix}", {"Uno": "# Uno\n\nhola.\n"})
		mirror = _make_space(f"wm{self.suffix}", "pf-wipe", {"Propia": "# Propia\n\nno borrar.\n"})
		source = self._source(mirror.name, self.hub, subdir="no-such-dir")
		logs_before = self._error_logs(source.name)

		for _ in range(2):
			self.assertEqual(pull_source(source.name)["reason"], "wipe-guard")
		state = self._state(source.name)
		self.assertEqual(state.last_status, "Error")
		self.assertEqual(state.consecutive_failures, 2)
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

	def test_timings_in_the_error_do_not_count_as_a_new_error(self):
		mirror = _make_space(f"t{self.suffix}", "pf-ms", {})
		source = self._source(mirror.name, os.path.join(self.tmp, "slow.git"))
		logs_before = self._error_logs(source.name)

		for ms in (133042, 129871, 7):
			error = frappe.ValidationError(
				f"git fetch failed: fatal: unable to access 'https://hub.invalid/x.git/': "
				f"Failed to connect to hub.invalid port 443 after {ms} ms: Could not connect to server"
			)
			with patch("wiki_press.git_pull.ensure_work_clone", side_effect=error):
				self.assertEqual(pull_source(source.name)["reason"], "fetch-failed")
		state = self._state(source.name)
		self.assertEqual(state.consecutive_failures, 3)
		self.assertIn("after 7 ms", state.last_error)
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

	def test_a_space_sync_that_ends_in_error_backs_off(self):
		"""upstream sync_space swallows its own errors and only marks the space;
		the pull must not count that as a full pull."""
		import wiki.wiki.git_sync as git_sync

		self._publish_into(self.hub, f"e{self.suffix}", {"Uno": "# Uno\n\nhola.\n"})
		mirror = _make_space(f"em{self.suffix}", "pf-serr", {})
		source = self._source(mirror.name, self.hub)
		logs_before = self._error_logs(source.name)

		def failing_sync(space_name, token=None, trigger="Manual"):
			git_sync._record_error(space_name, "Traceback ...\nfrappe.exceptions.ValidationError: route clash")

		with patch.object(git_sync, "sync_space", side_effect=failing_sync):
			for _ in range(2):
				result = pull_source(source.name)
				self.assertFalse(result["synced"])
				self.assertEqual(result["reason"], "sync-failed")
				self.assertEqual(result["space_status"], "Error")
		state = self._state(source.name)
		self.assertEqual(state.last_status, "Error")
		self.assertIn("route clash", state.last_error)
		self.assertEqual(state.consecutive_failures, 2)
		self.assertGreater(get_datetime(state.next_attempt_after), add_to_date(now_datetime(), minutes=55))
		self.assertFalse(frappe.db.get_value("Wiki Pull Source", source.name, "last_synced_sha"))
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)

		# The real sync then works and clears the streak.
		self.assertTrue(pull_source(source.name)["synced"])
		state = self._state(source.name)
		self.assertEqual(state.last_status, "Success")
		self.assertEqual(state.consecutive_failures, 0)
		self.assertIsNone(state.next_attempt_after)

	def test_an_error_before_the_space_sync_is_recorded_not_raised(self):
		self._publish_into(self.hub, f"x{self.suffix}", {"Uno": "# Uno\n\nhola.\n"})
		mirror = _make_space(f"xm{self.suffix}", "pf-raise", {})
		source = self._source(mirror.name, self.hub)
		logs_before = self._error_logs(source.name)

		boom = frappe.ValidationError("wiki_press: git_sync._fetch_tree changed (rebase break)")
		with patch("wiki_press.git_pull.assert_transport_contract", side_effect=boom):
			result = pull_source(source.name)
		self.assertFalse(result["synced"])
		self.assertEqual(result["reason"], "sync-failed")
		state = self._state(source.name)
		self.assertEqual(state.last_status, "Error")
		self.assertIn("rebase break", state.last_error)
		self.assertEqual(state.consecutive_failures, 1)
		self.assertEqual(self._error_logs(source.name) - logs_before, 1)
