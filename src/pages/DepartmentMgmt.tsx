import { useState } from "react";
import { useDepartments, useDepartmentSystems, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, useCreateDepartmentSystem, useUpdateDepartmentSystem, useDeleteDepartmentSystem, useTotalCapacity } from "../hooks/useDepartments";
import { useInterns } from "../hooks/useInterns";
import { Modal } from "../components/ui/Modal";
import { Department } from "../types";

const addIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const editIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

const cardColors = [
  { dot: "bg-indigo-500", border: "border-indigo-200", header: "bg-indigo-50", badge: "bg-indigo-100 text-indigo-700" },
  { dot: "bg-rose-500", border: "border-rose-200", header: "bg-rose-50", badge: "bg-rose-100 text-rose-700" },
  { dot: "bg-emerald-500", border: "border-emerald-200", header: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700" },
  { dot: "bg-amber-500", border: "border-amber-200", header: "bg-amber-50", badge: "bg-amber-100 text-amber-700" },
  { dot: "bg-violet-500", border: "border-violet-200", header: "bg-violet-50", badge: "bg-violet-100 text-violet-700" },
  { dot: "bg-cyan-500", border: "border-cyan-200", header: "bg-cyan-50", badge: "bg-cyan-100 text-cyan-700" },
];

export function DepartmentMgmtPage() {
  const { data: departments, isLoading } = useDepartments();
  const { data: systemsData } = useDepartmentSystems();
  const { data: interns } = useInterns("active");
  const { data: totalCapacity } = useTotalCapacity();
  const createDept = useCreateDepartment();
  const updateDept = useUpdateDepartment();
  const deleteDept = useDeleteDepartment();
  const createSystem = useCreateDepartmentSystem();
  const updateSystem = useUpdateDepartmentSystem();
  const deleteSystem = useDeleteDepartmentSystem();
  const operator = "管理员";

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"system" | "department">("system");
  const [editId, setEditId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formIsRotation, setFormIsRotation] = useState(true);
  const [formRotationInterval, setFormRotationInterval] = useState(1);
  const [formSystemId, setFormSystemId] = useState("");
  const [formCapacity, setFormCapacity] = useState(3);

  const internCount = interns?.length || 0;
  const capacityOk = (totalCapacity || 0) >= internCount;
  const systemList = (systemsData ?? []).sort((a, b) => a.sort_order - b.sort_order);

  const openAddSystem = () => {
    setModalType("system");
    setEditId(null);
    setFormName("");
    setFormSortOrder(systemList.length);
    setFormIsRotation(true);
    setFormRotationInterval(1);
    setShowModal(true);
  };

  const openEditSystem = (sys: (typeof systemList)[0]) => {
    setModalType("system");
    setEditId(sys.id);
    setFormName(sys.name);
    setFormSortOrder(sys.sort_order);
    setFormIsRotation(sys.is_rotation);
    setFormRotationInterval(sys.rotation_interval);
    setShowModal(true);
  };

  const openAddDept = (systemId: string) => {
    setModalType("department");
    setEditId(null);
    setFormName("");
    setFormSystemId(systemId);
    setFormCapacity(3);
    setShowModal(true);
  };

  const openEditDept = (dept: NonNullable<typeof departments>[0]) => {
    setModalType("department");
    setEditId(dept.id);
    setFormName(dept.name);
    setFormSystemId(dept.system_id);
    setFormCapacity(dept.capacity);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditId(null);
  };

  const handleSave = () => {
    if (modalType === "system") {
      if (!formName) return;
      if (editId) {
        const sys = systemList.find((s) => s.id === editId)!;
        updateSystem.mutate({
          system: { ...sys, name: formName, sort_order: formSortOrder, is_rotation: formIsRotation, rotation_interval: formRotationInterval },
          operator,
        });
      } else {
        createSystem.mutate({
          system: { id: crypto.randomUUID(), name: formName, sort_order: formSortOrder, is_rotation: formIsRotation, rotation_interval: formRotationInterval },
          operator,
        });
      }
    } else {
      if (!formName || !formSystemId) return;
      const now = Math.floor(Date.now() / 1000);
      if (editId) {
        updateDept.mutate({
          department: { id: editId, name: formName, system_id: formSystemId, capacity: formCapacity, is_active: true, created_at: 0, updated_at: now } as Department,
          operator,
        });
      } else {
        createDept.mutate({
          department: { id: crypto.randomUUID(), name: formName, system_id: formSystemId, capacity: formCapacity, is_active: true, created_at: now, updated_at: now } as Department,
          operator,
        });
      }
    }
    closeModal();
  };

  const handleDeleteSystem = (id: string) => {
    if (confirm("确定删除该轮转系统及其所有科室？")) deleteSystem.mutate({ id, operator });
  };

  const handleDeleteDept = (id: string) => {
    if (confirm("确定删除该科室？")) deleteDept.mutate({ id, operator });
  };

  const modalTitle =
    modalType === "system" ? (editId ? "编辑轮转系统" : "新增轮转系统") : editId ? "编辑科室" : "新增科室";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">科室管理</h2>
            <span className="text-sm text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
              {(departments || []).length} 科室 / 总容量 {totalCapacity || 0} 人
            </span>
          </div>
          <button
            onClick={openAddSystem}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            dangerouslySetInnerHTML={{ __html: addIcon + ' <span>新增系统</span>' }}
          />
        </div>

        {!capacityOk && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="flex-shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>科室总容量 ({totalCapacity}) 小于实习生总数 ({internCount})，请增加科室容量</span>
          </div>
        )}
      </div>

      <Modal open={showModal} title={modalTitle} onClose={closeModal}>
        <div className="space-y-3">
          {modalType === "system" ? (
            <>
              <div>
                <label className="text-sm text-slate-600 block mb-1">系统名称</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 block mb-1">排序序号</label>
                <input
                  type="number" min={0} value={formSortOrder}
                  onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="isRotation" checked={formIsRotation}
                  onChange={(e) => setFormIsRotation(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                />
                <label htmlFor="isRotation" className="text-sm text-slate-700">轮转系统</label>
              </div>
              {formIsRotation && (
                <div>
                  <label className="text-sm text-slate-600 block mb-1">轮转间隔（月）</label>
                  <input
                    type="number" min={1} value={formRotationInterval}
                    onChange={(e) => setFormRotationInterval(parseInt(e.target.value) || 1)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="text-sm text-slate-600 block mb-1">科室名称</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 block mb-1">所属系统</label>
                <select
                  value={formSystemId}
                  onChange={(e) => setFormSystemId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {systemList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-600 block mb-1">实习生容量</label>
                <input
                  type="number" min={1} value={formCapacity}
                  onChange={(e) => setFormCapacity(parseInt(e.target.value) || 1)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={closeModal}
              className="px-4 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              {editId ? "保存" : "添加"}
            </button>
          </div>
        </div>
      </Modal>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        ) : systemList.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" className="mx-auto text-slate-300 mb-4">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <p className="text-slate-500 mb-4">暂无轮转系统，请添加</p>
            <button
              onClick={openAddSystem}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              dangerouslySetInnerHTML={{ __html: addIcon + ' <span>新增系统</span>' }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {systemList.map((sys, idx) => {
              const color = cardColors[idx % cardColors.length];
              const depts = departments?.filter((d) => d.system_id === sys.id) || [];
              return (
                <div key={sys.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`flex items-center gap-2 px-4 py-3 border-b ${color.border} ${color.header}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                    <h3 className="font-bold text-slate-800 truncate">{sys.name}</h3>
                    <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${color.badge}`}>
                      {sys.is_rotation ? "轮转" : "固定"}
                    </span>
                    {sys.is_rotation && (
                      <span className="text-sm text-slate-500 bg-white/60 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                        {sys.rotation_interval}个月/轮
                      </span>
                    )}
                    <span className="text-sm text-slate-500 ml-auto whitespace-nowrap">{depts.length} 个科室</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditSystem(sys)}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-200/50 rounded-md transition-colors"
                        title="编辑系统" dangerouslySetInnerHTML={{ __html: editIcon }}
                      />
                      <button
                        onClick={() => handleDeleteSystem(sys.id)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-100 rounded-md transition-colors"
                        title="删除系统" dangerouslySetInnerHTML={{ __html: deleteIcon }}
                      />
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {depts.map((dept) => (
                      <div key={dept.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-stone-50 transition-all">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 text-base">{dept.name}</span>
                          <span className="text-base text-slate-700 font-medium ml-3">容量: {dept.capacity} 人</span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0 ml-2">
                          <button
                            onClick={() => openEditDept(dept)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                            title="编辑" dangerouslySetInnerHTML={{ __html: editIcon }}
                          />
                          <button
                            onClick={() => handleDeleteDept(dept.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="删除" dangerouslySetInnerHTML={{ __html: deleteIcon }}
                          />
                        </div>
                      </div>
                    ))}
                    {depts.length === 0 && (
                      <div className="text-slate-500 text-sm text-center py-4 font-medium">暂无科室</div>
                    )}
                    <button
                      onClick={() => openAddDept(sys.id)}
                      className="w-full mt-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-slate-600 border border-dashed border-slate-300 rounded-lg hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors font-medium"
                      dangerouslySetInnerHTML={{ __html: addIcon + ' <span>新增科室</span>' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
