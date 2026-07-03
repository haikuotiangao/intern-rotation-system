export interface Intern {
  id: string;
  class_name: string;
  name: string;
  gender?: string;
  phone?: string;
  parent_phone?: string;
  graduate_school?: string;
  remarks?: string;
  duration_months: number;
  start_date: string;
  end_date?: string;
  status: string;
  created_at: number;
  updated_at: number;
  fixed_department_id?: string;
  /** 轮转预分配状态: ready / pre_allocated / confirmed / completed */
  allocation_status?: string;
}

export interface DepartmentSystem {
  id: string;
  name: string;
  sort_order: number;
  is_rotation: boolean;
  rotation_interval: number;
}

export interface Department {
  id: string;
  name: string;
  system_id: string;
  capacity: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface DepartmentWithSystem {
  id: string;
  name: string;
  system_id: string;
  system_name: string;
  capacity: number;
  is_active: boolean;
}

export interface RotationWithNames {
  id: string;
  intern_id: string;
  intern_name: string;
  intern_school?: string;
  department_id: string;
  department_name: string;
  system_name: string;
  month_index: number;
  start_date?: string;
  end_date?: string;
  status: string;
}

export interface OperationLog {
  id: string;
  operator: string;
  action_type: string;
  action_detail: string;
  created_at: number;
}
