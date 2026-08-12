DROP TRIGGER IF EXISTS trg_payment_status_transition;
CREATE TRIGGER trg_payment_status_transition BEFORE UPDATE OF status ON payments
WHEN NOT ((OLD.status='pending' AND NEW.status IN ('succeeded','failed')) OR (OLD.status='failed' AND NEW.status='pending') OR (OLD.status='succeeded' AND NEW.status='refunded'))
BEGIN SELECT RAISE(ABORT, 'INVALID_PAYMENT_TRANSITION'); END;
