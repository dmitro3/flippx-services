import moment from 'moment';
import mongoose from 'mongoose';
import { Plan } from './model';
import { UserPlan } from './userPlanModel';
import { Transaction } from '../transaction/model';

export const list = async (query) => {
    try {
        const {
            offset = 0,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            status,
            isAvailableForPurchase,
        } = query;

        let params = {};

        if (status) {
            params.status = status.toUpperCase();
        }

        if (isAvailableForPurchase !== undefined) {
            params.isAvailableForPurchase = isAvailableForPurchase === 'true';
        }

        const plans = await Plan.find(params)
            .populate('createdBy', 'name.firstName name.lastName')
            .populate('updatedBy', 'name.firstName name.lastName')
            .populate('deprecatedBy', 'name.firstName name.lastName')
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 });

        const total = await Plan.countDocuments(params);

        return {
            status: 200,
            entity: {
                success: true,
                plans,
                pagination: {
                    total,
                    offset: parseInt(offset),
                    limit: parseInt(limit),
                },
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to fetch plans',
            },
        };
    }
};

export const create = async (body, user) => {
    try {
        const {
            name,
            description,
            price,
            currency,
            realCashAmount,
            virtualCashAmount,
            isAvailableForPurchase,
        } = body;

        const plan = await Plan.create({
            name,
            description,
            price,
            currency,
            realCashAmount,
            virtualCashAmount,
            isAvailableForPurchase,
            createdBy: user._id,
        });

        const populatedPlan = await Plan.findById(plan._id)
            .populate('createdBy', 'name.firstName name.lastName');

        return {
            status: 201,
            entity: {
                success: true,
                plan: populatedPlan,
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 409,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to create plan',
            },
        };
    }
};

export const show = async ({ id }) => {
    try {
        const plan = await Plan.findById(id)
            .populate('createdBy', 'name.firstName name.lastName')
            .populate('updatedBy', 'name.firstName name.lastName')
            .populate('deprecatedBy', 'name.firstName name.lastName');

        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        // Get active users count for this plan
        const activeUsersCount = await UserPlan.countDocuments({
            plan: id,
            status: 'ACTIVE',
        });

        // Get total purchases count
        const totalPurchasesCount = await UserPlan.countDocuments({
            plan: id,
        });

        return {
            status: 200,
            entity: {
                success: true,
                plan: {
                    ...plan.toObject(),
                    activeUsersCount,
                    totalPurchasesCount,
                },
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to fetch plan',
            },
        };
    }
};

export const update = async ({ id }, body, user) => {
    try {
        const plan = await Plan.findById(id);
        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        const {
            name,
            description,
            price,
            currency,
            realCashAmount,
            virtualCashAmount,
            isAvailableForPurchase,
        } = body;

        if (name !== undefined) plan.name = name;
        if (description !== undefined) plan.description = description;
        if (price !== undefined) plan.price = price;
        if (currency !== undefined) plan.currency = currency;
        if (realCashAmount !== undefined) plan.realCashAmount = realCashAmount;
        if (virtualCashAmount !== undefined) plan.virtualCashAmount = virtualCashAmount;
        if (isAvailableForPurchase !== undefined) plan.isAvailableForPurchase = isAvailableForPurchase;

        plan.updatedBy = user._id;

        const updatedPlan = await plan.save();

        const populatedPlan = await Plan.findById(updatedPlan._id)
            .populate('createdBy', 'name.firstName name.lastName')
            .populate('updatedBy', 'name.firstName name.lastName');

        return {
            status: 200,
            entity: {
                success: true,
                plan: populatedPlan,
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 409,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to update plan',
            },
        };
    }
};

export const remove = async ({ id }, user) => {
    try {
        const plan = await Plan.findById(id);
        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        if (plan.status === 'DEPRECATED') {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Plan is already deprecated',
                },
            };
        }

        // Instead of removing, we deprecate the plan
        plan.status = 'DEPRECATED';
        plan.isAvailableForPurchase = false;
        plan.deprecatedBy = user._id;
        plan.deprecatedAt = new Date();
        plan.updatedBy = user._id;

        await plan.save();

        return {
            status: 200,
            entity: {
                success: true,
                message: 'Plan has been deprecated successfully',
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 409,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to deprecate plan',
            },
        };
    }
};

export const getPlanAnalytics = async ({ id }, query) => {
    try {
        const plan = await Plan.findById(id);
        if (!plan) {
            return {
                status: 404,
                entity: {
                    success: false,
                    error: 'Plan not found',
                },
            };
        }

        const { period = 'weekly' } = query;

        // Calculate date range based on period
        let start, end, groupBy, dateFilter;

        if (period === 'weekly') {
            start = moment().startOf('week');
            end = moment().endOf('week');
            groupBy = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' },
            };
        } else if (period === 'monthly') {
            start = moment().startOf('month');
            end = moment().endOf('month');
            groupBy = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' },
            };
        } else if (period === 'custom') {
            const { startDate, endDate } = query;
            if (!startDate || !endDate) {
                return {
                    status: 400,
                    entity: {
                        success: false,
                        error: 'Start date and end date are required for custom period',
                    },
                };
            }
            start = moment(startDate);
            end = moment(endDate);
            groupBy = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' },
            };
        } else {
            return {
                status: 400,
                entity: {
                    success: false,
                    error: 'Invalid period. Must be weekly, monthly, or custom',
                },
            };
        }

        dateFilter = {
            createdAt: {
                $gte: start.toDate(),
                $lte: end.toDate(),
            },
        };

        // Get plan purchases over time
        const purchasesOverTime = await UserPlan.aggregate([
            {
                $match: {
                    plan: mongoose.Types.ObjectId(id),
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: groupBy,
                    count: { $sum: 1 },
                    revenue: { $sum: '$planSnapshot.price' },
                },
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 },
            },
        ]);

        // Get total statistics
        const totalStats = await UserPlan.aggregate([
            {
                $match: {
                    plan: mongoose.Types.ObjectId(id),
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: null,
                    totalPurchases: { $sum: 1 },
                    totalRevenue: { $sum: '$planSnapshot.price' },
                    activePurchases: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0],
                        },
                    },
                },
            },
        ]);

        const stats = totalStats[0] || {
            totalPurchases: 0,
            totalRevenue: 0,
            activePurchases: 0,
        };

        // Get purchased items (UserPlan records with user information)
        const purchasedItems = await UserPlan.aggregate([
            {
                $match: {
                    plan: mongoose.Types.ObjectId(id),
                    ...dateFilter,
                },
            },
            {
                $addFields: {
                    userObjectId: { $toObjectId: '$user' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userObjectId',
                    foreignField: '_id',
                    as: 'userInfo',
                },
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true
                },
            },
            {
                $lookup: {
                    from: 'payments',
                    localField: 'paymentReference',
                    foreignField: '_id',
                    as: 'paymentInfo',
                },
            },
            {
                $project: {
                    id: '$_id',
                    purchaseDate: '$purchaseDate',
                    status: '$status',
                    purchaseMethod: '$purchaseMethod',
                    planSnapshot: '$planSnapshot',
                    grantReason: '$grantReason',
                    createdAt: '$createdAt',
                    updatedAt: '$updatedAt',
                    user: {
                        $cond: {
                            if: '$userInfo',
                            then: {
                                id: '$userInfo._id',
                                name: '$userInfo.name',
                                email: '$userInfo.email',
                                phone: '$userInfo.phone',
                                role: '$userInfo.role',
                            },
                            else: {
                                id: '$user',
                                name: null,
                                email: null,
                                phone: null,
                                role: null,
                            }
                        }
                    },
                    paymentInfo: {
                        $cond: {
                            if: { $gt: [{ $size: '$paymentInfo' }, 0] },
                            then: {
                                $let: {
                                    vars: { payment: { $arrayElemAt: ['$paymentInfo', 0] } },
                                    in: {
                                        id: '$payment._id',
                                        method: '$payment.method',
                                        amount: '$payment.amount',
                                        currency: '$payment.currency',
                                        status: '$payment.status',
                                    }
                                }
                            },
                            else: null
                        }
                    },
                    grantedBy: {
                        $cond: {
                            if: { $ne: ['$grantedBy', null] },
                            then: '$grantedBy',
                            else: null
                        }
                    }
                },
            },
            {
                $sort: { createdAt: -1 },
            },
        ]);

        return {
            status: 200,
            entity: {
                success: true,
                analytics: {
                    plan: {
                        id: plan._id,
                        name: plan.name,
                        price: plan.price,
                    },
                    period: {
                        type: period,
                        start: start.toISOString(),
                        end: end.toISOString(),
                    },
                    statistics: stats,
                    purchasesOverTime,
                    purchasedItems,
                },
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to get plan analytics',
            },
        };
    }
};

export const getUserPlans = async (user, query) => {
    try {
        const {
            offset = 0,
            limit = 10,
            status,
        } = query;

        let filter = { user: user._id };

        if (status) {
            filter.status = status.toUpperCase();
        }

        const userPlans = await UserPlan.find(filter)
            .populate('plan')
            .populate('paymentReference')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset));

        const total = await UserPlan.countDocuments(filter);

        return {
            status: 200,
            entity: {
                success: true,
                userPlans,
                pagination: {
                    total,
                    offset: parseInt(offset),
                    limit: parseInt(limit),
                },
            },
        };
    } catch (error) {
        console.log(error);
        return {
            status: 500,
            entity: {
                success: false,
                error: error.errors || error.message || 'Failed to get user plans',
            },
        };
    }
};