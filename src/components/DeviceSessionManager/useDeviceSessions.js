import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
        fetchDeviceSessions,
        revokeDeviceSession,
        revokeOtherDeviceSessions,
} from "../../slices/deviceSessionsSlice";

export default function useDeviceSessions() {
        const dispatch = useDispatch();
        const { sessions, loading, error } = useSelector((state) => state.deviceSessions);

        useEffect(() => {
                dispatch(fetchDeviceSessions());
        }, [dispatch]);

        const handleRevokeSession = useCallback(
                (deviceId) => dispatch(revokeDeviceSession(deviceId)),
                [dispatch]
        );

        const handleRevokeAllExceptCurrent = useCallback(
                () => dispatch(revokeOtherDeviceSessions()),
                [dispatch]
        );

        const { currentSession, otherSessions, hasOtherSessions } = useMemo(() => {
                const current = sessions.find((session) => session.isCurrent) || null;
                const others = sessions.filter((session) => !session.isCurrent);

                return {
                        currentSession: current,
                        otherSessions: others,
                        hasOtherSessions: others.length > 0,
                };
        }, [sessions]);

        return {
                sessions,
                currentSession,
                otherSessions,
                hasOtherSessions,
                loading,
                error,
                handleRevokeSession,
                handleRevokeAllExceptCurrent,
                refreshSessions: () => dispatch(fetchDeviceSessions()),
        };
}
