-- =============================================================================
-- RPC Function: get_analytics_summary
-- Replaces fetching 50k+ raw rows with server-side aggregation
-- Returns: JSON with live_users, total_pageviews, unique_visitors, unique_pages,
--          chart_data, and ab_results
-- =============================================================================

CREATE OR REPLACE FUNCTION get_analytics_summary(
    p_range TEXT DEFAULT '7d',
    p_exclude_admin BOOLEAN DEFAULT FALSE,
    p_exclude_bots BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
    v_result JSONB;
    v_live_users INT;
    v_total_pageviews INT;
    v_unique_visitors INT;
    v_unique_pages INT;
    v_chart_data JSONB;
    v_ab_results JSONB;
    v_admin_ips TEXT[] := ARRAY['71.38.79.10', '71.38.82.163'];
    v_bot_ips TEXT[] := ARRAY['::1', '127.0.0.1'];
    v_excluded_ips TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Determine time range
    CASE p_range
        WHEN '24h' THEN v_start_time := v_now - INTERVAL '24 hours';
        WHEN '7d'  THEN v_start_time := v_now - INTERVAL '7 days';
        WHEN '30d' THEN v_start_time := v_now - INTERVAL '30 days';
        WHEN 'all' THEN v_start_time := '1970-01-01'::TIMESTAMPTZ;
        ELSE v_start_time := v_now - INTERVAL '7 days';
    END CASE;

    -- 2. Build excluded IPs list
    IF p_exclude_admin THEN
        v_excluded_ips := v_excluded_ips || v_admin_ips;
    END IF;
    IF p_exclude_bots THEN
        v_excluded_ips := v_excluded_ips || v_bot_ips;
    END IF;

    -- 3. Live users (last 5 minutes)
    SELECT COUNT(DISTINCT session_id)
    INTO v_live_users
    FROM analytics_logs
    WHERE created_at > v_now - INTERVAL '5 minutes'
      AND (array_length(v_excluded_ips, 1) IS NULL OR ip_address IS NULL OR NOT (ip_address = ANY(v_excluded_ips)));

    -- 4. Summary counts
    SELECT
        COUNT(DISTINCT COALESCE(ip_address, session_id)),
        COUNT(*) FILTER (WHERE event_name = 'pageview'),
        COUNT(DISTINCT path)
    INTO v_unique_visitors, v_total_pageviews, v_unique_pages
    FROM analytics_logs
    WHERE created_at > v_start_time
      AND (array_length(v_excluded_ips, 1) IS NULL OR ip_address IS NULL OR NOT (ip_address = ANY(v_excluded_ips)));

    -- 5. Chart data (bucketed by hour for 24h, by day otherwise)
    IF p_range = '24h' THEN
        SELECT COALESCE(jsonb_agg(row_data ORDER BY bucket), '[]'::JSONB)
        INTO v_chart_data
        FROM (
            SELECT
                date_trunc('hour', created_at) AS bucket,
                jsonb_build_object(
                    'name', TO_CHAR(date_trunc('hour', created_at), 'FMHH AM'),
                    'visitors', COUNT(DISTINCT COALESCE(session_id, ip_address)),
                    'pageviews', COUNT(*) FILTER (WHERE event_name = 'pageview'),
                    'unique_pages', COUNT(DISTINCT path),
                    'avg_per_user', CASE 
                        WHEN COUNT(DISTINCT COALESCE(session_id, ip_address)) > 0 
                        THEN ROUND((COUNT(*) FILTER (WHERE event_name = 'pageview'))::NUMERIC / COUNT(DISTINCT COALESCE(session_id, ip_address)), 1)
                        ELSE 0 
                    END
                ) AS row_data
            FROM analytics_logs
            WHERE created_at > v_start_time
              AND (array_length(v_excluded_ips, 1) IS NULL OR ip_address IS NULL OR NOT (ip_address = ANY(v_excluded_ips)))
            GROUP BY date_trunc('hour', created_at)
        ) sub;
    ELSE
        SELECT COALESCE(jsonb_agg(row_data ORDER BY bucket), '[]'::JSONB)
        INTO v_chart_data
        FROM (
            SELECT
                date_trunc('day', created_at) AS bucket,
                jsonb_build_object(
                    'name', TO_CHAR(date_trunc('day', created_at), 'Mon DD'),
                    'visitors', COUNT(DISTINCT COALESCE(session_id, ip_address)),
                    'pageviews', COUNT(*) FILTER (WHERE event_name = 'pageview'),
                    'unique_pages', COUNT(DISTINCT path),
                    'avg_per_user', CASE 
                        WHEN COUNT(DISTINCT COALESCE(session_id, ip_address)) > 0 
                        THEN ROUND((COUNT(*) FILTER (WHERE event_name = 'pageview'))::NUMERIC / COUNT(DISTINCT COALESCE(session_id, ip_address)), 1)
                        ELSE 0 
                    END
                ) AS row_data
            FROM analytics_logs
            WHERE created_at > v_start_time
              AND (array_length(v_excluded_ips, 1) IS NULL OR ip_address IS NULL OR NOT (ip_address = ANY(v_excluded_ips)))
            GROUP BY date_trunc('day', created_at)
        ) sub;
    END IF;

    -- 6. A/B test results
    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
    INTO v_ab_results
    FROM (
        SELECT jsonb_build_object(
            'variant', metadata->>'variant',
            'visitors', COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'experiment_view'),
            'conversions', COUNT(DISTINCT session_id) FILTER (WHERE event_name IN ('conversion', 'click_preorder')),
            'conversion_rate', CASE
                WHEN COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'experiment_view') > 0
                THEN ROUND(
                    (COUNT(DISTINCT session_id) FILTER (WHERE event_name IN ('conversion', 'click_preorder')))::NUMERIC /
                    (COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'experiment_view')) * 100, 1
                )
                ELSE 0
            END
        ) AS row_data
        FROM analytics_logs
        WHERE created_at > v_start_time
          AND metadata->>'variant' IS NOT NULL
          AND (array_length(v_excluded_ips, 1) IS NULL OR ip_address IS NULL OR NOT (ip_address = ANY(v_excluded_ips)))
        GROUP BY metadata->>'variant'
    ) sub;

    -- 7. Assemble result
    v_result := jsonb_build_object(
        'live_users', v_live_users,
        'total_pageviews', v_total_pageviews,
        'unique_visitors', v_unique_visitors,
        'unique_pages', v_unique_pages,
        'chart_data', v_chart_data,
        'ab_results', v_ab_results
    );

    RETURN v_result;
END;
$$;
