"""
Sample Python file to demonstrate Python Log Dimmer & Mask features.
Contains various logger conventions, multiline statements, comments, and strings.
"""

import os
import sys
import time
import logging
from loguru import logger as loguru_logger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class OrderService:
    def __init__(self, db_client):
        self.db = db_client
        self.logger = logging.getLogger("OrderService")

    def process_order(self, order_id: str, user_id: str, amount: float):
        # 1. Start logging (Single-line log)
        logger.info("Starting order processing for order_id=%s, user_id=%s", order_id, user_id)

        # Core business logic: validate
        if amount <= 0:
            self.logger.warning("Invalid order amount: %.2f for order %s", amount, order_id)
            raise ValueError("Amount must be positive")

        self.logger.debug("Order validation passed successfully")

        # Core business logic: query user
        user = self.db.find_user(user_id)
        if not user:
            self.logger.error("User not found: %s while processing order %s", user_id, order_id)
            return False

        # Multiline log with dictionary and complex formatting
        logger.info(
            "Order %s qualified for discount. Applying rules for user %s",
            order_id,
            user["username"],
            extra={
                "order_id": order_id,
                "user_tier": user.get("tier", "standard"),
                "timestamp": time.time(),
                "nested_data": [1, 2, (3, 4)],
            },
        )

        # Core business logic: execute payment
        payment_status = self.db.execute_transaction(user_id, amount)

        # Loguru usage: info & success (first-class level in loguru)
        loguru_logger.info(f"Transaction completed with status: {payment_status}")
        loguru_logger.success(f"Payment verified for order {order_id}")

        if payment_status != "SUCCESS":
            # Multiline log with comments inside
            logger.critical(
                # Alert operations team
                "Payment gateway rejected transaction for order %s! Status: %s",
                order_id,
                payment_status,
            )
            return False

        # Loguru chained calls: .bind(...).success(...)
        loguru_logger.bind(order_id=order_id).success("Order lifecycle processed")

        # Python 3.14 (PEP 750) Template String (t-string) support:
        logger.info(t"Order {order_id} completed successfully")

        # Loguru trace level
        loguru_logger.trace("Exiting OrderService.process_order")

        # Docstrings and strings should NOT be matched:
        note = "Do not call logger.info('fake') in strings"
        template_note = t"Do not match logger.success('fake_template') in t-strings"
        # logger.info("This is in a comment, should also be ignored")
        # logger.success("Commented success should be ignored")

        return True


if __name__ == "__main__":
    service = OrderService(db_client=None)
    logger.info("Demonstration script finished.")
