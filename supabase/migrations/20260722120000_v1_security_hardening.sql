-- V1 privilege hardening for RPC and trigger functions.

REVOKE ALL ON FUNCTION public.get_next_employee_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_employee_code(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.respond_to_shift_swap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_shift_swap(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.manage_leave_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_leave_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_roster(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_shift_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shift_template(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.prepare_starter_trial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_attendance_record_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_leave_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_shift_during_approved_leave() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_shifts_for_approved_leave() FROM PUBLIC, anon, authenticated;
