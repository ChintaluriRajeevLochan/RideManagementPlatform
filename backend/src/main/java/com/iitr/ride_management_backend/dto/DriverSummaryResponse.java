package com.iitr.ride_management_backend.dto;

import com.iitr.ride_management_backend.domain.AvailabilityStatus;
import java.math.BigDecimal;

public record DriverSummaryResponse(
        Long id,
        String name,
        String phone,
        AvailabilityStatus availabilityStatus,
        BigDecimal averageRating,
        int ratingCount,
        VehicleResponse vehicle,
        DriverLocationResponse location
) {
}
