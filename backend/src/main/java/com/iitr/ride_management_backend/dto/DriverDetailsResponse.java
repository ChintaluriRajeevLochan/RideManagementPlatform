package com.iitr.ride_management_backend.dto;

import com.iitr.ride_management_backend.domain.AvailabilityStatus;
import com.iitr.ride_management_backend.domain.VerificationStatus;
import java.math.BigDecimal;

public record DriverDetailsResponse(
        Long driverProfileId,
        String licenseNumber,
        String verificationDocument,
        VerificationStatus verificationStatus,
        AvailabilityStatus availabilityStatus,
        BigDecimal averageRating,
        int ratingCount,
        VehicleResponse vehicle,
        DriverLocationResponse location
) {
}
