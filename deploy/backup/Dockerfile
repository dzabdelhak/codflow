# Backup, restore test and disk check for deploy/compose.yml, run by cron.
FROM postgres:18-alpine
RUN apk add --no-cache bash curl rclone su-exec
COPY common.sh backup.sh restore-test.sh disk-check.sh entrypoint.sh /opt/codflow/
COPY crontab /etc/crontabs/root
RUN chmod +x /opt/codflow/*.sh
ENTRYPOINT ["/opt/codflow/entrypoint.sh"]
CMD ["crond", "-f", "-l", "8"]
